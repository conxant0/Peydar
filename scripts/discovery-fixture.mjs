// Repeatable discovery examples for personal verification. Never touches the working database.
import Database from 'better-sqlite3';
import path from 'node:path';
import { databasePath, openDatabase } from '../src/lib/db.ts';
import { discoverPapers } from '../src/lib/discovery.ts';
import { SearchError } from '../src/lib/paper-search.ts';
import { createTopic, listTopics } from '../src/lib/topics.ts';

const file = databasePath();
if (!process.env.DATABASE_PATH || file === path.resolve('data/paper-radar.sqlite')) {
  console.error('Refusing to run: set DATABASE_PATH to a separate verification database, e.g. DATABASE_PATH=data/verify.sqlite');
  process.exit(1);
}

const profiles = {
  A: {
    name: 'Fixture A',
    question: 'How can AI coding agents manage context across parallel branches?',
    description: 'Research on context management for long-horizon coding agents, particularly synchronization and selective information sharing across parallel work.',
    interests: 'coding agents\ncontext management\nagent memory',
    nonInterests: 'generic RAG',
  },
  B: {
    name: 'Fixture B',
    question: 'How do language models retrieve evidence for scientific claims?',
    description: 'Research on evidence retrieval for claim verification.',
    interests: 'claim verification\nevidence retrieval',
    nonInterests: '',
  },
};

const paper = (id, title, abstract = `Fixture abstract for ${title}.`) => ({
  id, title, abstract, authors: ['Fixture Author'], year: 2025, publicationDate: null, venue: 'Fixture Venue',
  url: `https://example.org/paper-radar-fixture/${id}`, citationCount: 0,
});
const shared = paper('fixture-shared', 'Shared fixture paper (found by both topics)');
const missing = paper('fixture-missing-abstract', 'Fixture paper without an abstract', null);

// Canned search: each query returns one paper of its own; the first also returns the shared paper.
function cannedSearch(key, label, failAt = -1) {
  let index = -1;
  return async () => {
    index++;
    if (index === failAt) throw new SearchError('Search returned HTTP 500 after 4 attempts (fixture failure).');
    const own = paper(`fixture-${key}-${label}-${index + 1}`, `Fixture ${key} ${label} paper ${index + 1}`);
    return index === 0 ? [shared, own, own, ...(key === 'A' && label === 'base' ? [missing] : [])] : [own];
  };
}

const command = process.argv[2];
if (command === 'check') {
  const ro = new Database(file, { readonly: true, fileMustExist: true });
  const one = (sql, ...args) => ro.prepare(sql).get(...args).n;
  console.log(`Papers stored: ${one('SELECT count(*) AS n FROM papers')}`);
  console.log(`"${shared.id}" rows in papers: ${one('SELECT count(*) AS n FROM papers WHERE id = ?', shared.id)}`);
  console.log(`"${shared.id}" topic associations: ${one('SELECT count(*) AS n FROM topic_papers WHERE paper_id = ?', shared.id)}`);
  console.log(`Duplicate topic/paper pairs: ${one('SELECT count(*) AS n FROM (SELECT 1 FROM topic_papers GROUP BY topic_id, paper_id HAVING count(*) > 1)')}`);
  for (const row of ro.prepare(`SELECT t.name, count(tp.paper_id) AS papers, sum(p.abstract IS NULL) AS missing
    FROM research_topics t LEFT JOIN topic_papers tp ON tp.topic_id = t.id LEFT JOIN papers p ON p.id = tp.paper_id
    GROUP BY t.id ORDER BY t.name`).all()) {
    console.log(`${row.name}: ${row.papers} candidates, ${row.missing ?? 0} missing abstracts`);
  }
  ro.close();
  process.exit(0);
}

const db = openDatabase(file);
const topic = (key) => listTopics(db).find((item) => item.name === profiles[key].name) ?? createTopic(db, profiles[key]);
const noWait = { sleep: async () => {} };
const report = (run) => run.queries.forEach((q) => console.log(`  ${q.status.padEnd(7)} ${q.query} (returned ${q.returned ?? '-'}, new ${q.added ?? '-'})${q.error ? ` ${q.error}` : ''}`));

if (command === 'setup') {
  for (const key of ['A', 'B']) {
    const run = await discoverPapers(db, topic(key).id, cannedSearch(key, 'base'), noWait);
    console.log(`${profiles[key].name}: ${run.newPapers} new associations`);
    report(run);
  }
} else if (command === 'partial' || command === 'retry') {
  const run = await discoverPapers(db, topic('A').id, cannedSearch('A', 'partial', command === 'partial' ? 1 : -1), noWait);
  console.log(`${profiles.A.name}: ${run.newPapers} new associations`);
  report(run);
} else {
  console.error('Usage: npm run fixture:discovery -- setup | partial | retry | check');
  process.exitCode = 1;
}
db.close();
