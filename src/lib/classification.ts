import type Database from 'better-sqlite3';
import { ClassifierError, classifierTimeoutMs, configVersion, type Classify } from './classifier.ts';
import { getTopic } from './topics.ts';

export type ClassifyOutcome =
  | { status: 'classified'; paperId: string }
  | { status: 'failed'; paperId: string; error: string; unavailable: boolean }
  | { status: 'none' };

type Options = { exclude?: string[]; testService: boolean; now?: () => Date };

// Classifies the next pending paper with an abstract. Callers loop until 'none'.
// `exclude` holds papers that already failed during this run so a bad paper cannot repeat forever.
export async function classifyNext(db: Database.Database, topicId: string, classify: Classify, options: Options): Promise<ClassifyOutcome> {
  const now = options.now ?? (() => new Date());
  const claimMs = classifierTimeoutMs() + 30_000;
  const exclude = JSON.stringify(options.exclude ?? []);

  const claim = db.transaction(() => {
    const topic = getTopic(db, topicId);
    if (!topic) return null;
    const at = now();
    const row = db.prepare(`SELECT p.id, p.title, p.abstract FROM topic_papers tp
      JOIN papers p ON p.id = tp.paper_id
      LEFT JOIN classifications c ON c.topic_id = tp.topic_id AND c.paper_id = tp.paper_id
      WHERE tp.topic_id = ? AND p.abstract IS NOT NULL AND c.paper_id IS NULL
        AND (tp.claimed_until IS NULL OR tp.claimed_until < ?)
        AND p.id NOT IN (SELECT value FROM json_each(?))
      ORDER BY tp.discovered_at, tp.rowid LIMIT 1`).get(topicId, at.toISOString(), exclude) as
      { id: string; title: string; abstract: string } | undefined;
    if (!row) return null;
    db.prepare('UPDATE topic_papers SET claimed_until = ? WHERE topic_id = ? AND paper_id = ?')
      .run(new Date(at.getTime() + claimMs).toISOString(), topicId, row.id);
    return { topic, paper: row };
  });

  const claimed = claim.immediate();
  if (!claimed) return { status: 'none' };
  const { topic, paper } = claimed;
  const release = db.prepare('UPDATE topic_papers SET claimed_until = NULL, last_error = ?, failed_at = ? WHERE topic_id = ? AND paper_id = ?');

  let answer: Awaited<ReturnType<Classify>>;
  try {
    answer = await classify({
      researchProfile: { question: topic.question, description: topic.description, interests: topic.interests, nonInterests: topic.nonInterests },
      paper: { title: paper.title, abstract: paper.abstract },
    });
  } catch (error) {
    if (!(error instanceof ClassifierError)) {
      release.run(null, null, topicId, paper.id);
      throw error;
    }
    release.run(error.message, now().toISOString(), topicId, paper.id);
    return { status: 'failed', paperId: paper.id, error: error.message, unavailable: error.unavailable };
  }

  // The association may have been deleted with its topic while the request was in flight;
  // skip the insert so nothing is resurrected.
  const stored = db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM topic_papers WHERE topic_id = ? AND paper_id = ?').get(topicId, paper.id)) return false;
    db.prepare(`INSERT INTO classifications
      (topic_id, paper_id, relevance, confidence, profile_revision, model, config_version, test_service, latency_ms, classified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(topic_id, paper_id) DO UPDATE SET relevance = excluded.relevance, confidence = excluded.confidence,
        profile_revision = excluded.profile_revision, model = excluded.model, config_version = excluded.config_version,
        test_service = excluded.test_service, latency_ms = excluded.latency_ms, classified_at = excluded.classified_at
      WHERE excluded.profile_revision >= classifications.profile_revision`)
      .run(topicId, paper.id, answer.result.relevance, answer.result.confidence, topic.profileRevision, answer.model,
        configVersion, Number(options.testService), answer.latencyMs, now().toISOString());
    release.run(null, null, topicId, paper.id);
    return true;
  })();
  return stored ? { status: 'classified', paperId: paper.id } : { status: 'none' };
}

export type Progress = { total: number; missingAbstract: number; classified: number; failed: number; pending: number };

export function classificationProgress(db: Database.Database, topicId: string): Progress {
  const row = db.prepare(`SELECT count(*) AS total, coalesce(sum(p.abstract IS NULL), 0) AS missingAbstract,
      count(c.paper_id) AS classified,
      coalesce(sum(p.abstract IS NOT NULL AND c.paper_id IS NULL AND tp.last_error IS NOT NULL), 0) AS failed
    FROM topic_papers tp JOIN papers p ON p.id = tp.paper_id
    LEFT JOIN classifications c ON c.topic_id = tp.topic_id AND c.paper_id = tp.paper_id
    WHERE tp.topic_id = ?`).get(topicId) as Omit<Progress, 'pending'>;
  return { ...row, pending: row.total - row.missingAbstract - row.classified - row.failed };
}
