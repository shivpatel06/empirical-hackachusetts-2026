import "server-only";
import { getServerEnv } from "../env";
import { openDatabase, type Db } from "./connection";
import { currentMigrationVersion } from "./version";

// Reuse one connection per process (and across dev hot reloads).
const globalForDb = globalThis as unknown as { __trialPrescreeningDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__trialPrescreeningDb) {
    // fileMustExist: a missing database should surface as "run setup", not be
    // silently created empty by a request.
    globalForDb.__trialPrescreeningDb = openDatabase(getServerEnv().DATABASE_PATH, {
      fileMustExist: true,
    });
  }
  return globalForDb.__trialPrescreeningDb;
}

export interface DbStatus {
  ok: boolean;
  migrationVersion: number;
  error?: string;
}

export function checkDatabase(): DbStatus {
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    return { ok: true, migrationVersion: currentMigrationVersion(db) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      migrationVersion: 0,
      error: `database unavailable (${message.slice(0, 120)}); run \`npm run setup\``.slice(0, 200),
    };
  }
}
