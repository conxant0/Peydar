import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { expectedAnswer, startTestService, testModel } from '../scripts/test-classifier.mjs';
import { classificationProgress, classifyNext } from '../src/lib/classification.ts';
import { ClassifierError, classifierRequest, createClassifier } from '../src/lib/classifier.ts';
import { getDatabase, openDatabase } from '../src/lib/db.ts';
import { discoverPapers, listCandidates } from '../src/lib/discovery.ts';
import { createTopic, deleteTopic, updateTopic } from '../src/lib/topics.ts';

const profile = {
  name: 'A',
  question: 'How can AI coding agents manage context across parallel branches?',
  description: 'Research on context management for long-horizon coding agents.',
  interests: 'coding agents\ncontext management',
  nonInterests: 'generic RAG',
};
const input = {
  researchProfile: { question: profile.question, description: profile.description, interests: ['coding agents', 'context management'], nonInterests: ['generic RAG'] },
  paper: { title: 'Paper p1', abstract: 'About p1' },
};
const paper = (id, abstract = `About ${id}`) => ({ id, title: `Paper ${id}`, abstract, authors: [], year: 2025, publicationDate: null, venue: null, url: `https://example.org/${id}`, citationCount: null });

async function withService(run) {
  const service = await startTestService({ port: 0 });
  try { return await run(service, createClassifier({ baseUrl: service.url, model: testModel, timeoutMs: 1000 })); } finally { service.server.close(); }
}

async function withTopic(papers, run) {
  const dir = mkdtempSync(path.join(tmpdir(), 'paper-radar-'));
  const db = openDatabase(path.join(dir, 'test.sqlite'));
  try {
    const topic = createTopic(db, profile);
    await discoverPapers(db, topic.id, async () => papers, { sleep: async () => {} });
    return await run(db, topic);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
}

async function drain(db, topicId, classify) {
  const failed = [];
  for (let outcome; (outcome = await classifyNext(db, topicId, classify, { exclude: failed, testService: true })).status !== 'none';) {
    if (outcome.status === 'failed') failed.push(outcome.paperId);
  }
  return failed;
}

test('request uses the configured model, shared state, and stable criteria order', () => {
  const body = classifierRequest(input, 'm');
  assert.equal(body.model, 'm');
  assert.deepEqual(body.state, {
    research_profile: { question: profile.question, description: profile.description, interests: ['coding agents', 'context management'], non_interests: ['generic RAG'] },
    paper: { title: 'Paper p1', abstract: 'About p1' },
  });
  assert.equal(body.questions.relevance.type, 'choice');
  assert.deepEqual(Object.keys(body.questions.relevance.criteria), ['relevant', 'maybe', 'irrelevant']);
});

test('adapter maps answers and rejects bad responses over real HTTP', () => withService(async (service, classify) => {
  const answer = await classify(input);
  assert.deepEqual(answer.result, { relevance: expectedAnswer('Paper p1').choice, confidence: expectedAnswer('Paper p1').confidence });
  assert.equal(answer.model, testModel);
  assert.ok(Number.isInteger(answer.latencyMs));

  const rejects = async (scenario, pattern, unavailable) => {
    service.state.scenario = scenario;
    await assert.rejects(classify(input), (error) => error instanceof ClassifierError && pattern.test(error.message) && error.unavailable === unavailable);
  };
  await rejects('invalid-json', /not JSON/, false);
  await rejects('bad-label', /unexpected label/, false);
  await rejects('bad-confidence', /invalid confidence/, false);
  await rejects('http-500', /HTTP 500/, true);
  service.state.scenario = 'ok';
  await assert.rejects(createClassifier({ baseUrl: service.url, model: 'wrong' })(input), /HTTP 422: Loaded model is 'paper-radar-test'/);
  service.state.delayMs = 1500;
  await assert.rejects(classify(input), (error) => error.unavailable && /within 1 s/.test(error.message));
  await assert.rejects(createClassifier({ baseUrl: 'http://127.0.0.1:9', model: 'm' })(input), (error) => error.unavailable && /Could not reach/.test(error.message));
  await assert.rejects(createClassifier({ baseUrl: '', model: '' })(input), /JEV_BASE_URL/);
}));

test('each success persists with provenance, repeats skip completed papers, missing abstracts are never sent', () => withService((service, classify) =>
  withTopic([paper('p1'), paper('p2'), paper('none', null)], async (db, topic) => {
    assert.deepEqual(await drain(db, topic.id, classify), []);
    assert.equal(service.state.requests, 2);
    assert.equal(service.state.byTitle['Paper none'], undefined);
    const row = db.prepare("SELECT * FROM classifications WHERE paper_id = 'p1'").get();
    assert.equal(row.relevance, expectedAnswer('Paper p1').choice);
    assert.equal(row.model, testModel);
    assert.equal(row.config_version, 'relevance-choice-v1');
    assert.equal(row.test_service, 1);
    assert.equal(row.profile_revision, 1);
    assert.ok(row.latency_ms >= 0);
    assert.deepEqual(classificationProgress(db, topic.id), { total: 3, missingAbstract: 1, classified: 2, failed: 0, pending: 0 });

    assert.deepEqual(await drain(db, topic.id, classify), []);
    assert.equal(service.state.requests, 2);
    assert.equal(listCandidates(db, topic.id).find((item) => item.id === 'none').classification, null);
  })));

test('a bad response stores no result, is skipped for the rest of the run, and retries later', () => withService((service, classify) =>
  withTopic([paper('p1'), paper('p2')], async (db, topic) => {
    service.state.scenario = 'bad-label';
    assert.deepEqual(await drain(db, topic.id, classify), ['p1', 'p2']);
    assert.equal(service.state.requests, 2);
    assert.equal(db.prepare('SELECT count(*) AS n FROM classifications').get().n, 0);
    assert.match(listCandidates(db, topic.id)[0].lastError, /unexpected label/);
    assert.deepEqual(classificationProgress(db, topic.id), { total: 2, missingAbstract: 0, classified: 0, failed: 2, pending: 0 });

    service.state.scenario = 'ok';
    assert.deepEqual(await drain(db, topic.id, classify), []);
    assert.equal(listCandidates(db, topic.id)[0].lastError, null);
    assert.equal(classificationProgress(db, topic.id).classified, 2);
  })));

test('an active claim blocks duplicate work, and an expired claim is retryable after a crash', () => withService((service, classify) =>
  withTopic([paper('p1')], async (db, topic) => {
    service.state.delayMs = 200;
    const first = classifyNext(db, topic.id, classify, { testService: true });
    assert.deepEqual(await classifyNext(db, topic.id, classify, { testService: true }), { status: 'none' });
    assert.equal((await first).status, 'classified');
    assert.equal(service.state.requests, 1);

    // Simulate a crash that left a claim behind.
    db.prepare('DELETE FROM classifications').run();
    db.prepare("UPDATE topic_papers SET claimed_until = '2000-01-01T00:00:00.000Z'").run();
    assert.equal((await classifyNext(db, topic.id, classify, { testService: true })).status, 'classified');
  })));

test('an in-flight answer cannot resurrect a deleted topic or overwrite a newer revision', () => withService((service, classify) =>
  withTopic([paper('p1'), paper('p2')], async (db, topic) => {
    const deleting = async (value) => { deleteTopic(db, topic.id); return classify(value); };
    assert.deepEqual(await classifyNext(db, topic.id, deleting, { testService: true }), { status: 'none' });
    assert.equal(db.prepare('SELECT count(*) AS n FROM classifications').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM topic_papers').get().n, 0);
  })).then(() => withService((service, classify) => withTopic([paper('p1')], async (db, topic) => {
    const stale = async (value) => {
      updateTopic(db, topic.id, { ...profile, question: 'A newer question?' });
      db.prepare(`INSERT INTO classifications VALUES (?, 'p1', 'maybe', 0.5, 2, 'm', 'v', 1, 1, 'now')`).run(topic.id);
      return classify(value);
    };
    await classifyNext(db, topic.id, stale, { testService: true });
    const row = db.prepare('SELECT relevance, profile_revision FROM classifications').get();
    assert.deepEqual({ ...row }, { relevance: 'maybe', profile_revision: 2 });
  }))));

test('database rejects invalid labels and confidence', () => withTopic([paper('p1')], async (db, topic) => {
  const insert = (relevance, confidence) => db.prepare('INSERT INTO classifications VALUES (?, ?, ?, ?, 1, ?, ?, 0, 1, ?)').run(topic.id, 'p1', relevance, confidence, 'm', 'v', 'now');
  assert.throws(() => insert('very-relevant', 0.5), /CHECK/);
  assert.throws(() => insert('relevant', 1.5), /CHECK/);
}));

test('test mode refuses the working database', () => {
  const saved = { mode: process.env.JEV_TEST_MODE, path: process.env.DATABASE_PATH };
  process.env.JEV_TEST_MODE = '1';
  delete process.env.DATABASE_PATH;
  try { assert.throws(() => getDatabase(), /separate DATABASE_PATH/); } finally {
    if (saved.mode === undefined) delete process.env.JEV_TEST_MODE; else process.env.JEV_TEST_MODE = saved.mode;
    if (saved.path !== undefined) process.env.DATABASE_PATH = saved.path;
  }
});
