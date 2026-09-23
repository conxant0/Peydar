import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveQueries } from '../src/lib/queries.ts';

const profile = {
  question: 'How can AI coding agents manage context across parallel branches?',
  description: 'Research on context management for long-horizon coding agents, particularly synchronization and selective information sharing across parallel work.',
  interests: ['coding agents', 'context management', 'agent memory', 'dependency tracking', 'stale context detection'],
  nonInterests: ['generic RAG'],
};

const expected = [
  'coding agents context management',
  'coding agents agent memory',
  'coding agents dependency tracking',
  'coding agents stale context detection',
  'coding agents parallel branches',
  'context management for long-horizon coding agents',
];

test('query preview has the reviewed order and responds to each profile source', () => {
  assert.deepEqual(deriveQueries(profile), expected);
  assert.deepEqual(deriveQueries(profile), expected);
  assert.ok(deriveQueries({ ...profile, interests: [...profile.interests, 'workflow repair'] }).some((query) => query.includes('workflow repair')));
  assert.ok(deriveQueries({ ...profile, question: 'How do agents recover after interruptions?' }).some((query) => query.includes('recover after interruptions')));
  assert.ok(deriveQueries({ ...profile, question: 'How do agents work with memory across parallel branches?' }).includes('coding agents parallel branches'));
  assert.ok(deriveQueries({ ...profile, description: 'Research on selective context sharing, with examples.' }).includes('selective context sharing'));
});

test('whitespace, punctuation, repeated interests, and empty optional lists stay bounded', () => {
  assert.deepEqual(deriveQueries({
    ...profile,
    question: ' How can AI coding agents manage context across  parallel branches ? ',
    description: '  Research on   context management for long-horizon coding agents, more detail. ',
    interests: [' coding   agents! ', 'context management.', 'CONTEXT MANAGEMENT', 'agent memory', 'agent memory!'],
    nonInterests: [],
  }), [
    'coding agents context management',
    'coding agents agent memory',
    'coding agents parallel branches',
    'context management for long-horizon coding agents',
  ]);
  assert.deepEqual(deriveQueries({ ...profile, interests: ['coding agents'], nonInterests: [] }), expected.slice(-2));
  assert.deepEqual(deriveQueries({ ...profile, interests: ['', '  '], question: '?!', description: '...!', nonInterests: [] }), []);
  assert.ok(deriveQueries({ ...profile, interests: ['coding agents', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'] }).length <= 8);
});
