import type { Db } from "./connection";

// Kept separate from migrate.ts so request-time code (the health route) does
// not pull filesystem migration loading into the server bundle.

/** Highest applied migration version, or 0 when none has been applied. */
export function currentMigrationVersion(db: Db): number {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (!table) return 0;
  const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as {
    version: number | null;
  };
  return row.version ?? 0;
}
