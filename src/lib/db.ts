import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const migrations = ['001_topics.sql', '002_papers.sql'];

export function databasePath() {
  return path.resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH || 'data/paper-radar.sqlite');
}

export function openDatabase(file = databasePath()) {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version > migrations.length) {
    db.close();
    throw new Error('Database was created by a newer Paper Radar version.');
  }
  migrations.slice(version).forEach((name, index) => {
    const sql = readFileSync(path.join(process.cwd(), 'db/migrations', name), 'utf8');
    db.exec(`BEGIN;\n${sql}\nPRAGMA user_version = ${version + index + 1};\nCOMMIT;`);
  });
  return db;
}

let singleton: ReturnType<typeof openDatabase> | undefined;

export function getDatabase() {
  singleton ??= openDatabase();
  return singleton;
}
