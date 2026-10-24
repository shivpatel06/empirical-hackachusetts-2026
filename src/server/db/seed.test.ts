import { describe, expect, it } from "vitest";
import { openDatabase } from "./connection";
import { runMigrations } from "./migrate";
import { seedDatabase } from "./seed";

describe("seedDatabase", () => {
  it("inserts the synthetic marker rows once and is idempotent", () => {
    const db = openDatabase(":memory:");
    runMigrations(db);

    const first = seedDatabase(db, () => new Date("2026-10-24T10:00:00.000Z"));
    expect(first.inserted).toBe(2);

    const second = seedDatabase(db, () => new Date("2026-10-25T10:00:00.000Z"));
    expect(second.inserted).toBe(0);

    const rows = db.prepare("SELECT key, value FROM app_meta ORDER BY key").all();
    expect(rows).toEqual([
      { key: "dataset", value: "synthetic-demo" },
      { key: "seeded_at", value: "2026-10-24T10:00:00.000Z" },
    ]);
  });

  it("refuses to seed before migrations have run", () => {
    const db = openDatabase(":memory:");
    expect(() => seedDatabase(db)).toThrow(/db:migrate/);
  });
});
