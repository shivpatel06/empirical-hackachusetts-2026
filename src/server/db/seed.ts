import type { Db } from "./connection";

export interface SeedResult {
  inserted: number;
}

/**
 * Inserts the synthetic-demo marker rows. Uses INSERT OR IGNORE so a second
 * run changes nothing (seeded_at keeps its first value). The six-case synthetic
 * cohort is added to this seed in a later task.
 */
export function seedDatabase(db: Db, now: () => Date = () => new Date()): SeedResult {
  const hasMeta = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_meta'")
    .get();
  if (!hasMeta) {
    throw new Error("app_meta table is missing; run `npm run db:migrate` first");
  }
  const timestamp = now().toISOString();
  const insert = db.prepare(
    "INSERT OR IGNORE INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)",
  );
  const rows: Array<[string, string]> = [
    ["dataset", "synthetic-demo"],
    ["seeded_at", timestamp],
  ];
  let inserted = 0;
  db.transaction(() => {
    for (const [key, value] of rows) {
      inserted += insert.run(key, value, timestamp).changes;
    }
  })();
  return { inserted };
}
