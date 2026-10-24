import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./connection";
import { currentMigrationVersion } from "./version";

export { currentMigrationVersion };

export const DEFAULT_MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

const MIGRATION_FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Reads numbered `NNNN_name.sql` files, sorted by version. */
export function loadMigrations(dir: string = DEFAULT_MIGRATIONS_DIR): Migration[] {
  const migrations: Migration[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".sql")) continue;
    const match = MIGRATION_FILE.exec(file);
    if (!match) {
      throw new Error(`Migration file name must match NNNN_name.sql: ${file}`);
    }
    migrations.push({
      version: Number(match[1]),
      name: match[2] as string,
      sql: readFileSync(join(dir, file), "utf8"),
    });
  }
  migrations.sort((a, b) => a.version - b.version);
  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i]?.version === migrations[i - 1]?.version) {
      throw new Error(`Duplicate migration version ${migrations[i]?.version}`);
    }
  }
  return migrations;
}

function ensureMigrationsTable(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
}

export interface MigrationResult {
  applied: Migration[];
  version: number;
}

/**
 * Applies pending migrations in order. Each migration and its bookkeeping row
 * commit in one transaction, so re-running is a no-op and a failed migration
 * leaves no partial state.
 */
export function runMigrations(
  db: Db,
  dir: string = DEFAULT_MIGRATIONS_DIR,
  now: () => Date = () => new Date(),
): MigrationResult {
  ensureMigrationsTable(db);
  const current = currentMigrationVersion(db);
  const pending = loadMigrations(dir).filter((m) => m.version > current);
  const record = db.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
  );
  for (const migration of pending) {
    db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.version, migration.name, now().toISOString());
    })();
  }
  return { applied: pending, version: currentMigrationVersion(db) };
}
