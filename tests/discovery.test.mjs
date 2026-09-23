import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../src/lib/db.ts';
import { discoverPapers, latestRun, listCandidates } from '../src/lib/discovery.ts';
import { createSearch, normalizeSemanticScholar, SearchError } from '../src/lib/paper-search.ts';
import { createTopic, deleteTopic } from '../src/lib/topics.ts';

const profile = {
  name: 'A',
  question: 'How can AI coding agents manage context across parallel branches?',
  description: 'Research on context management for long-horizon coding agents.',
  interests: 'coding agents\ncontext management\nagent memory',
  nonInterests: '',
};
const noWait = { sleep: async () => {} };
const raw = (id, extra = {}) => ({ paperId: id, title: `Paper ${id}`, abstract: `About ${id}`, authors: [{ name: 'Ada' }], year: 2024, url: `https://example.org/${id}`, ...extra });
const paper = (id, extra) => normalizeSemanticScholar(raw(id, extra));
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });

function withDb(run) {
  const dir = mkdtempSync(path.join(tmpdir(), 'paper-radar-'));
  const db = openDatabase(path.join(dir, 'test.sqlite'));
  return Promise.resolve(run(db)).finally(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
}

test('Semantic Scholar client sends fields and key, normalizes missing metadata, and handles empty results', async () => {
  const calls = [];
  const search = createSearch('semantic-scholar', { ...noWait, apiKey: 'k', fetch: async (url, init) => {
    calls.push({ url: new URL(url), init });
    return calls.length === 1
      ? json({ total: 3, data: [raw('p1'), { paperId: 'p2', title: ' Bare ', abstract: '', authors: null }, { paperId: 'p3' }] })
      : json({ total: 0, offset: 0 });
  } });
  const papers = await search('coding agents', 9);
  assert.equal(calls[0].url.searchParams.get('query'), 'coding agents');
  assert.equal(calls[0].url.searchParams.get('limit'), '9');
  assert.match(calls[0].url.searchParams.get('fields'), /abstract/);
  assert.equal(calls[0].init.headers['x-api-key'], 'k');
  assert.deepEqual(papers.map((paper) => paper.id), ['p1', 'p2']);
  assert.deepEqual(papers[1], { id: 'p2', title: 'Bare', abstract: null, authors: [], year: null, publicationDate: null, venue: null, url: 'https://www.semanticscholar.org/paper/p2', citationCount: null });
  assert.deepEqual(await search('nothing', 9), []);
});

test('OpenAlex client uses semantic search, rebuilds abstracts, and drops repeated titles', async () => {
  let url;
  const work = (id, title, extra = {}) => ({ id: `https://openalex.org/${id}`, display_name: title, publication_year: 2026, cited_by_count: 4,
    authorships: [{ author: { display_name: 'Ada' } }, { author: {} }], primary_location: { source: { display_name: 'Venue' } }, ...extra });
  const search = createSearch('openalex', { ...noWait, apiKey: 'k', fetch: async (href) => {
    url = new URL(href);
    return json({ meta: { count: 3 }, results: [
      work('W1', 'Context Rot', { doi: 'https://doi.org/10.1/x', abstract_inverted_index: { agents: [1], Coding: [0], forget: [2] } }),
      work('W2', 'context rot'),
      work('W3', 'No abstract', { abstract_inverted_index: null }),
      { id: 'https://openalex.org/W4' },
    ] });
  } });
  const papers = await search('coding agents', 7);
  assert.equal(url.searchParams.get('search.semantic'), 'coding agents');
  assert.equal(url.searchParams.get('per_page'), '7');
  assert.equal(url.searchParams.get('api_key'), 'k');
  assert.deepEqual(papers.map((paper) => paper.id), ['W1', 'W3']);
  assert.deepEqual(papers[0], { id: 'W1', title: 'Context Rot', abstract: 'Coding agents forget', authors: ['Ada'], year: 2026, publicationDate: null, venue: 'Venue', url: 'https://doi.org/10.1/x', citationCount: 4 });
  assert.equal(papers[1].abstract, null);
  assert.equal(papers[1].url, 'https://openalex.org/W3');
  await assert.rejects(createSearch('openalex', { ...noWait, apiKey: '', retries: 0, fetch: async () => json({}, 429) })('q', 5), /OPENALEX_API_KEY/);
});

test('client follows Retry-After, then gives up after bounded retries', async () => {
  const waits = [];
  let calls = 0;
  const recovering = createSearch('semantic-scholar', { sleep: async (ms) => { waits.push(ms); }, apiKey: '', fetch: async () =>
    ++calls === 1 ? json({ message: 'slow down' }, 429, { 'Retry-After': '3' }) : json({ data: [raw('p1')] }) });
  assert.equal((await recovering('q', 5)).length, 1);
  assert.deepEqual(waits, [3000]);

  calls = 0;
  waits.length = 0;
  const limited = createSearch('semantic-scholar', { sleep: async (ms) => { waits.push(ms); }, apiKey: '', retries: 2, fetch: async () => { calls++; return json({}, 429); } });
  await assert.rejects(limited('q', 5), (error) => error instanceof SearchError && error.rateLimited);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [2000, 4000]);
  await assert.rejects(createSearch('semantic-scholar', { ...noWait, fetch: async () => json({}, 400) })('q', 5), /HTTP 400/);
});

test('discovery deduplicates across queries and topics and enforces unique pairs', () => withDb(async (db) => {
  const a = createTopic(db, profile);
  const b = createTopic(db, { ...profile, name: 'B' });
  const search = async (query) => query.includes('memory') ? [paper('shared'), paper('m1')] : [paper('shared'), paper('shared'), paper('missing', { abstract: null })];
  const run = await discoverPapers(db, a.id, search, noWait);
  assert.equal(run.newPapers, 3);
  assert.ok(run.finishedAt);
  assert.equal((await discoverPapers(db, a.id, search, noWait)).newPapers, 0);
  await discoverPapers(db, b.id, search, noWait);
  assert.equal(db.prepare("SELECT count(*) AS n FROM papers WHERE id = 'shared'").get().n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM topic_papers WHERE paper_id = 'shared'").get().n, 2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM topic_papers WHERE topic_id = ?').get(a.id).n, 3);
  assert.throws(() => db.prepare("INSERT INTO topic_papers (topic_id, paper_id, query, discovered_at) VALUES (?, 'shared', 'q', 'now')").run(a.id), /UNIQUE/);
  assert.throws(() => db.prepare("INSERT INTO papers (id, title, authors, url, updated_at) VALUES ('shared', 't', '[]', 'u', 'now')").run(), /UNIQUE/);
  assert.equal(listCandidates(db, a.id).find((paper) => paper.id === 'missing').abstract, null);

  deleteTopic(db, b.id);
  assert.equal(db.prepare("SELECT count(*) AS n FROM papers WHERE id = 'shared'").get().n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM topic_papers WHERE paper_id = 'shared'").get().n, 1);
}));

test('a later query failure keeps earlier candidates and a rate limit stops the run', () => withDb(async (db) => {
  const a = createTopic(db, profile);
  let calls = 0;
  const failing = async () => { if (++calls === 2) throw new SearchError('HTTP 500'); return [paper(`p${calls}`)]; };
  const run = await discoverPapers(db, a.id, failing, noWait);
  assert.deepEqual(run.queries.map((query) => query.status), ['done', 'failed', 'done', 'done']);
  assert.equal(listCandidates(db, a.id).length, 3);

  const limited = async () => { throw new SearchError('rate limited', true); };
  const stopped = await discoverPapers(db, a.id, limited, noWait);
  assert.deepEqual(stopped.queries.map((query) => query.status), ['failed', 'skipped', 'skipped', 'skipped']);
  assert.equal(listCandidates(db, a.id).length, 3);
  assert.equal(latestRun(db, a.id).id, stopped.id);
}));

test('discovery caps a run at the target and does not resurrect a deleted topic', () => withDb(async (db) => {
  const a = createTopic(db, profile);
  let next = 0;
  const many = async (_query, limit) => Array.from({ length: limit + 20 }, () => paper(`n${next++}`));
  const run = await discoverPapers(db, a.id, many, noWait);
  assert.equal(run.newPapers, 50);
  assert.equal(run.queries.at(-1).status, 'skipped');

  const b = createTopic(db, { ...profile, name: 'B' });
  const deleting = async () => { deleteTopic(db, b.id); return [paper('late')]; };
  assert.equal(await discoverPapers(db, b.id, deleting, noWait), null);
  assert.equal(db.prepare('SELECT count(*) AS n FROM topic_papers WHERE topic_id = ?').get(b.id).n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM papers WHERE id = 'late'").get().n, 0);
}));
