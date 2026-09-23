import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../src/lib/db.ts';
import { createTopic, deleteTopic, getTopic, listTopics, updateTopic, ValidationError } from '../src/lib/topics.ts';

const example = {
  name: 'Branch-Aware Context Management',
  question: 'How can AI coding agents manage context across parallel branches?',
  description: 'Research on context management for long-horizon coding agents.',
  interests: 'coding agents\ncontext management',
  nonInterests: 'generic RAG',
};

test('topics persist, validate, isolate, and revise only for substantive edits', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'paper-radar-'));
  const file = path.join(dir, 'topics.sqlite');
  try {
    let db = openDatabase(file);
    const a = createTopic(db, example);
    const b = createTopic(db, { ...example, name: 'Different topic' });
    assert.equal(a.profileRevision, 1);
    assert.deepEqual(a.interests, ['coding agents', 'context management']);
    assert.throws(() => createTopic(db, { ...example, name: ' ' }), ValidationError);
    assert.throws(() => createTopic(db, { ...example, interests: '\n ' }), ValidationError);
    assert.equal(listTopics(db).length, 2);
    db.close();

    db = openDatabase(file);
    assert.deepEqual(getTopic(db, a.id)?.interests, a.interests);
    assert.equal(updateTopic(db, a.id, { ...example, name: 'Renamed' })?.profileRevision, 1);
    assert.equal(updateTopic(db, a.id, { ...example, description: 'Changed', interests: 'coding agents\nnew interest' })?.profileRevision, 2);
    assert.equal(getTopic(db, b.id)?.profileRevision, 1);
    deleteTopic(db, b.id);
    assert.equal(getTopic(db, b.id), null);
    assert.equal(getTopic(db, a.id)?.description, 'Changed');
    db.close();

    db = openDatabase(file);
    assert.equal(listTopics(db).length, 1);
    assert.equal(db.pragma('user_version', { simple: true }), 1);
    db.close();
    const restored = path.join(dir, 'restored.sqlite');
    copyFileSync(file, restored);
    db = openDatabase(restored);
    assert.equal(getTopic(db, a.id)?.description, 'Changed');
    db.close();
    assert.ok(readFileSync(file).length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
