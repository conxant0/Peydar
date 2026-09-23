import type Database from 'better-sqlite3';
import { deriveQueries } from './queries.ts';
import { SearchError, type PaperMetadata, type SearchPapers } from './paper-search.ts';
import { getTopic } from './topics.ts';

export const discoveryTarget = 50;
const requestSpacingMs = 1100;

export type QueryResult = {
  query: string;
  status: 'pending' | 'done' | 'failed' | 'skipped';
  returned?: number;
  added?: number;
  error?: string;
};

export type DiscoveryRun = {
  id: number;
  queries: QueryResult[];
  newPapers: number;
  startedAt: string;
  finishedAt: string | null;
};

export type Candidate = PaperMetadata & { query: string; discoveredAt: string };

type Options = { sleep?: (ms: number) => Promise<void> };

export async function discoverPapers(db: Database.Database, topicId: string, search: SearchPapers, options: Options = {}) {
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const topic = getTopic(db, topicId);
  if (!topic) return null;
  const queries: QueryResult[] = deriveQueries(topic).map((query) => ({ query, status: 'pending' }));
  const limit = Math.ceil(discoveryTarget / Math.max(queries.length, 1));
  const runId = Number(db.prepare('INSERT INTO discovery_runs (topic_id, queries, started_at) VALUES (?, ?, ?)')
    .run(topicId, JSON.stringify(queries), new Date().toISOString()).lastInsertRowid);
  const saveRun = db.prepare('UPDATE discovery_runs SET queries = ?, new_papers = ?, finished_at = ? WHERE id = ?');
  const seen = new Set<string>();
  let newPapers = 0;

  const persist = db.transaction((result: QueryResult, papers: PaperMetadata[]) => {
    // A topic deleted mid-run must not be recreated through its associations.
    if (!getTopic(db, topicId)) return false;
    const now = new Date().toISOString();
    const upsert = db.prepare(`INSERT INTO papers
      (id, title, abstract, authors, year, publication_date, venue, url, citation_count, updated_at)
      VALUES (@id, @title, @abstract, @authors, @year, @publicationDate, @venue, @url, @citationCount, @now)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, abstract = coalesce(excluded.abstract, papers.abstract),
        authors = excluded.authors, year = coalesce(excluded.year, papers.year),
        publication_date = coalesce(excluded.publication_date, papers.publication_date),
        venue = coalesce(excluded.venue, papers.venue), url = excluded.url,
        citation_count = coalesce(excluded.citation_count, papers.citation_count), updated_at = excluded.updated_at`);
    const associate = db.prepare('INSERT OR IGNORE INTO topic_papers (topic_id, paper_id, query, discovered_at) VALUES (?, ?, ?, ?)');
    result.added = 0;
    for (const paper of papers) {
      upsert.run({ ...paper, authors: JSON.stringify(paper.authors), now });
      result.added += associate.run(topicId, paper.id, result.query, now).changes;
    }
    newPapers += result.added;
    saveRun.run(JSON.stringify(queries), newPapers, null, runId);
    return true;
  });

  for (const [index, result] of queries.entries()) {
    if (result.status !== 'pending') continue;
    if (seen.size >= discoveryTarget) {
      Object.assign(result, { status: 'skipped', error: `Reached the ${discoveryTarget}-paper target.` });
      continue;
    }
    if (index) await sleep(requestSpacingMs);
    try {
      const found = await search(result.query, limit);
      const papers = found.filter((paper) => seen.size < discoveryTarget && !seen.has(paper.id) && !!seen.add(paper.id));
      Object.assign(result, { status: 'done', returned: found.length });
      if (!persist(result, papers)) return null;
    } catch (error) {
      if (!(error instanceof SearchError)) throw error;
      Object.assign(result, { status: 'failed', error: error.message });
      if (error.rateLimited) {
        queries.filter((item) => item.status === 'pending')
          .forEach((item) => Object.assign(item, { status: 'skipped', error: 'Skipped after the rate limit was reached.' }));
      }
      saveRun.run(JSON.stringify(queries), newPapers, null, runId);
    }
  }
  if (!getTopic(db, topicId)) return null;
  saveRun.run(JSON.stringify(queries), newPapers, new Date().toISOString(), runId);
  return latestRun(db, topicId);
}

export function latestRun(db: Database.Database, topicId: string): DiscoveryRun | null {
  const row = db.prepare('SELECT * FROM discovery_runs WHERE topic_id = ? ORDER BY id DESC LIMIT 1').get(topicId) as
    { id: number; queries: string; new_papers: number; started_at: string; finished_at: string | null } | undefined;
  return row ? { id: row.id, queries: JSON.parse(row.queries), newPapers: row.new_papers, startedAt: row.started_at, finishedAt: row.finished_at } : null;
}

export function listCandidates(db: Database.Database, topicId: string): Candidate[] {
  const rows = db.prepare(`SELECT p.*, tp.query, tp.discovered_at FROM topic_papers tp
    JOIN papers p ON p.id = tp.paper_id WHERE tp.topic_id = ? ORDER BY tp.discovered_at, tp.rowid`).all(topicId) as Record<string, never>[];
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    abstract: row.abstract,
    authors: JSON.parse(row.authors),
    year: row.year,
    publicationDate: row.publication_date,
    venue: row.venue,
    url: row.url,
    citationCount: row.citation_count,
    query: row.query,
    discoveredAt: row.discovered_at,
  }));
}
