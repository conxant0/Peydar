// Known classified papers for checking order, filters, counts, and saves. Never touches the working database.
import Database from 'better-sqlite3';
import path from 'node:path';
import { countCandidates } from '../src/lib/browsing.ts';
import { databasePath, openDatabase } from '../src/lib/db.ts';
import { listCandidates } from '../src/lib/discovery.ts';
import { createTopic, listTopics } from '../src/lib/topics.ts';

const profiles = [
  { name: 'Browsing A', question: 'How can AI coding agents manage context across parallel branches?',
    description: 'Fixture topic with known classifications.', interests: 'coding agents', nonInterests: '' },
  { name: 'Browsing B', question: 'How do language models retrieve evidence for scientific claims?',
    description: 'Fixture topic sharing one paper with Browsing A.', interests: 'evidence retrieval', nonInterests: '' },
];

// Listed in discovery order, deliberately not the expected display order.
const papers = [
  ['browse-irrelevant-99', 'irrelevant', 0.99],
  ['browse-relevant-60', 'relevant', 0.6],
  ['browse-missing-abstract', null, null],
  ['browse-maybe-99', 'maybe', 0.99],
  ['browse-relevant-90', 'relevant', 0.9],
];
export const sharedPaper = 'browse-relevant-60';

const title = (id) => `Fixture: ${id.replace('browse-', '').replace(/-(\d\d)$/, ' 0.$1').replace('-', ' ')}`;

export function loadBrowsingFixture(db) {
  const [a, b] = profiles.map((profile) => listTopics(db).find((topic) => topic.name === profile.name) ?? createTopic(db, profile));
  const paper = db.prepare(`INSERT OR IGNORE INTO papers (id, title, abstract, authors, year, venue, url, citation_count, updated_at)
    VALUES (?, ?, ?, '["Fixture Author"]', 2025, 'Fixture Venue', ?, 0, ?)`);
  const associate = db.prepare('INSERT OR IGNORE INTO topic_papers (topic_id, paper_id, query, discovered_at) VALUES (?, ?, ?, ?)');
  const classify = db.prepare(`INSERT OR IGNORE INTO classifications
    (topic_id, paper_id, relevance, confidence, profile_revision, model, config_version, test_service, latency_ms, classified_at)
    VALUES (?, ?, ?, ?, ?, 'fixture', 'fixture', 1, 0, ?)`);
  db.transaction(() => {
    papers.forEach(([id, relevance, confidence], index) => {
      const now = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
      paper.run(id, title(id), relevance ? `Fixture abstract for ${title(id)}.` : null, `https://example.org/paper-radar-fixture/${id}`, now);
      associate.run(a.id, id, 'fixture', now);
      if (relevance) classify.run(a.id, id, relevance, confidence, a.profileRevision, now);
    });
    associate.run(b.id, sharedPaper, 'fixture', new Date().toISOString());
  })();
  return { a, b };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = databasePath();
  if (!process.env.DATABASE_PATH || file === path.resolve('data/paper-radar.sqlite')) {
    console.error('Refusing to run: set DATABASE_PATH to a separate verification database, e.g. DATABASE_PATH=data/verify.sqlite');
    process.exit(1);
  }
  const command = process.argv[2];
  if (command === 'setup') {
    const db = openDatabase(file);
    loadBrowsingFixture(db);
    db.close();
    console.log('Loaded Browsing A (5 papers, 4 classified) and Browsing B (shares one paper). Existing saves are kept.');
  } else if (command === 'check') {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    for (const topic of profiles.map((profile) => listTopics(db).find((item) => item.name === profile.name)).filter(Boolean)) {
      const candidates = listCandidates(db, topic.id);
      const counts = countCandidates(candidates);
      console.log(`${topic.name}: ${counts.retrieved} retrieved, ${counts.scanned} scanned, ${counts.relevant} relevant, ${counts.maybe} maybe, ${counts.irrelevant} irrelevant, ${counts.saved} saved`);
      candidates.forEach((paper) => console.log(`  ${paper.savedAt ? 'saved' : '     '} ${paper.title}`));
    }
    db.close();
  } else {
    console.error('Usage: npm run fixture:browsing -- setup | check');
    process.exitCode = 1;
  }
}
