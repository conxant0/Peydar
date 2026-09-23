import { databasePath, openDatabase } from '../src/lib/db.ts';

const db = openDatabase();
db.close();
console.log(`Database ready: ${databasePath()}`);
