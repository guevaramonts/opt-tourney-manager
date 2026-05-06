import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import { runMigrations } from './migrations';

let db: Database.Database | null = null;

/**
 * Returns the singleton SQLite connection.
 * Initialises and migrates the DB on first call.
 * Must only be called from the main process.
 */
export function getDatabase(): Database.Database {
  if (db) return db;

  const dbPath = path.join(app.getPath('userData'), 'pocket-director.db');
  db = new Database(dbPath);
  runMigrations(db);
  return db;
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}

// Ensure the connection is closed cleanly when the app exits
process.on('exit', closeDatabase);
