import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadBrowsingFixture, sharedPaper } from '../scripts/browsing-fixture.mjs';
import { countCandidates, filterCandidates, parseFilter, setSaved } from '../src/lib/browsing.ts';
import { openDatabase } from '../src/lib/db.ts';
import { listCandidates } from '../src/lib/discovery.ts';
import { deleteTopic, updateTopic } from '../src/lib/topics.ts';

function withFixture(run) {
  const dir = mkdtempSync(path.join(tmpdir(), 'paper-radar-'));
  const file = path.join(dir, 'test.sqlite');
  let db = openDatabase(file);
  const reopen = () => { db.close(); return (db = openDatabase(file)); };
  try { return run(db, loadBrowsingFixture(db), reopen); } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
}

const ids = (candidates) => candidates.map((paper) => paper.id);

test('classified papers sort by relevance then confidence; unclassified come last', () => withFixture((db, { a }) => {
  assert.deepEqual(ids(listCandidates(db, a.id)),
    ['browse-relevant-90', 'browse-relevant-60', 'browse-maybe-99', 'browse-irrelevant-99', 'browse-missing-abstract']);
  assert.equal(listCandidates(db, a.id).at(-1).classification, null);
}));

test('filters select stored labels and saves; unclassified never matches a label', () => withFixture((db, { a }) => {
  const all = listCandidates(db, a.id);
  assert.deepEqual(ids(filterCandidates(all, 'relevant')), ['browse-relevant-90', 'browse-relevant-60']);
  assert.deepEqual(ids(filterCandidates(all, 'maybe')), ['browse-maybe-99']);
  assert.deepEqual(ids(filterCandidates(all, 'irrelevant')), ['browse-irrelevant-99']);
  assert.deepEqual(filterCandidates(all, 'saved'), []);
  assert.equal(filterCandidates(all, null).length, 5);
  assert.equal(parseFilter('saved'), 'saved');
  assert.equal(parseFilter('bogus'), null);
  assert.equal(parseFilter(['relevant']), null);
}));

test('saves persist, repeat without duplicating, and count correctly', () => withFixture((db, { a }, reopen) => {
  assert.equal(setSaved(db, a.id, 'browse-relevant-60', true), true);
  assert.equal(setSaved(db, a.id, 'browse-maybe-99', true), true);
  const first = listCandidates(db, a.id).find((paper) => paper.id === 'browse-maybe-99').savedAt;
  assert.equal(setSaved(db, a.id, 'browse-maybe-99', true), true);
  db = reopen();
  const saved = filterCandidates(listCandidates(db, a.id), 'saved');
  assert.deepEqual(ids(saved), ['browse-relevant-60', 'browse-maybe-99']);
  assert.equal(saved[1].savedAt, first);
  assert.equal(db.prepare('SELECT count(*) AS n FROM topic_papers WHERE topic_id = ?').get(a.id).n, 5);
  assert.deepEqual(countCandidates(listCandidates(db, a.id)),
    { retrieved: 5, scanned: 4, relevant: 2, maybe: 1, irrelevant: 1, saved: 2, outdated: 0 });

  assert.equal(setSaved(db, a.id, 'browse-maybe-99', false), true);
  assert.equal(setSaved(db, a.id, 'browse-maybe-99', false), true);
  assert.deepEqual(ids(filterCandidates(listCandidates(db, a.id), 'saved')), ['browse-relevant-60']);
  assert.equal(countCandidates(listCandidates(db, a.id)).saved, 1);
  assert.equal(setSaved(db, a.id, 'not-associated', true), false);
}));

test('a save in one topic does not appear in another topic sharing the paper', () => withFixture((db, { a, b }) => {
  setSaved(db, a.id, sharedPaper, true);
  assert.equal(listCandidates(db, b.id).find((paper) => paper.id === sharedPaper).savedAt, null);
  assert.equal(countCandidates(listCandidates(db, b.id)).saved, 0);
  deleteTopic(db, b.id);
  assert.ok(listCandidates(db, a.id).find((paper) => paper.id === sharedPaper).savedAt);
}));

test('profile edits mark labels outdated but keep them in filters, counts, and saves', () => withFixture((db, { a }) => {
  setSaved(db, a.id, 'browse-relevant-90', true);
  updateTopic(db, a.id, { name: 'Renamed', question: a.question, description: a.description, interests: 'coding agents', nonInterests: '' });
  assert.equal(countCandidates(listCandidates(db, a.id)).outdated, 0);
  updateTopic(db, a.id, { name: 'Renamed', question: 'A different question?', description: a.description, interests: 'coding agents', nonInterests: '' });
  const all = listCandidates(db, a.id);
  assert.ok(all[0].classification.outdated);
  assert.equal(filterCandidates(all, 'relevant').length, 2);
  assert.deepEqual(countCandidates(all), { retrieved: 5, scanned: 4, relevant: 2, maybe: 1, irrelevant: 1, saved: 1, outdated: 4 });
}));
