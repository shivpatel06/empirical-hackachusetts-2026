import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Db = Database.Database;

export interface OpenDatabaseOptions {
  /** Fail instead of creating an empty database file. */
  fileMustExist?: boolean;
}

export function openDatabase(filePath: string, options: OpenDatabaseOptions = {}): Db {
  const fileMustExist = options.fileMustExist ?? false;
  if (filePath !== ":memory:" && !fileMustExist) {
    mkdirSync(dirname(resolve(filePath)), { recursive: true });
  }
  const db = new Database(filePath, { fileMustExist });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
