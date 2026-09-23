import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export type TopicInput = {
  name: string;
  question: string;
  description: string;
  interests: string;
  nonInterests: string;
};

export type Topic = {
  id: string;
  name: string;
  question: string;
  description: string;
  interests: string[];
  nonInterests: string[];
  profileRevision: number;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  name: string;
  question: string;
  description: string;
  interests: string;
  non_interests: string;
  profile_revision: number;
  created_at: string;
  updated_at: string;
};

export class ValidationError extends Error {
  errors: Partial<Record<keyof TopicInput, string>>;
  constructor(errors: Partial<Record<keyof TopicInput, string>>) {
    super('Please correct the highlighted fields.');
    this.errors = errors;
  }
}

export function inputFrom(formData: FormData): TopicInput {
  const value = (name: string) => {
    const field = formData.get(name);
    return typeof field === 'string' ? field : '';
  };
  const list = (name: string) => formData.getAll(name).filter((field): field is string => typeof field === 'string').join('\n');
  return {
    name: value('name'),
    question: value('question'),
    description: value('description'),
    interests: list('interests'),
    nonInterests: list('nonInterests'),
  };
}

function normalize(input: TopicInput) {
  const name = input.name.trim();
  const question = input.question.trim();
  const description = input.description.trim();
  const interests = input.interests.split('\n').map((item) => item.trim()).filter(Boolean);
  const nonInterests = input.nonInterests.split('\n').map((item) => item.trim()).filter(Boolean);
  const errors: Partial<Record<keyof TopicInput, string>> = {};
  if (!name) errors.name = 'Enter a topic name.';
  if (!question) errors.question = 'Enter a research question.';
  if (!description) errors.description = 'Enter a description.';
  if (!interests.length) errors.interests = 'Enter at least one interest.';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { name, question, description, interests, nonInterests };
}

function toTopic(row: Row): Topic {
  return {
    id: row.id,
    name: row.name,
    question: row.question,
    description: row.description,
    interests: JSON.parse(row.interests),
    nonInterests: JSON.parse(row.non_interests),
    profileRevision: row.profile_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listTopics(db: Database.Database): Topic[] {
  return (db.prepare('SELECT * FROM research_topics ORDER BY updated_at DESC, id').all() as Row[]).map(toTopic);
}

export function getTopic(db: Database.Database, id: string): Topic | null {
  const row = db.prepare('SELECT * FROM research_topics WHERE id = ?').get(id) as Row | undefined;
  return row ? toTopic(row) : null;
}

export function createTopic(db: Database.Database, input: TopicInput): Topic {
  const topic = normalize(input);
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO research_topics
    (id, name, question, description, interests, non_interests, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, topic.name, topic.question, topic.description, JSON.stringify(topic.interests), JSON.stringify(topic.nonInterests), now, now);
  return getTopic(db, id)!;
}

export function updateTopic(db: Database.Database, id: string, input: TopicInput): Topic | null {
  const topic = normalize(input);
  const current = getTopic(db, id);
  if (!current) return null;
  const changed = topic.question !== current.question || topic.description !== current.description ||
    JSON.stringify(topic.interests) !== JSON.stringify(current.interests) ||
    JSON.stringify(topic.nonInterests) !== JSON.stringify(current.nonInterests);
  db.prepare(`UPDATE research_topics SET name = ?, question = ?, description = ?, interests = ?,
    non_interests = ?, profile_revision = profile_revision + ?, updated_at = ? WHERE id = ?`)
    .run(topic.name, topic.question, topic.description, JSON.stringify(topic.interests),
      JSON.stringify(topic.nonInterests), Number(changed), new Date().toISOString(), id);
  return getTopic(db, id);
}

export function deleteTopic(db: Database.Database, id: string) {
  db.prepare('DELETE FROM research_topics WHERE id = ?').run(id);
}
