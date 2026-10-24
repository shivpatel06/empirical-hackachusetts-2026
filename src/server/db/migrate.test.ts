import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./connection";
import { currentMigrationVersion, loadMigrations, runMigrations } from "./migrate";

const tempDirs: string[] = [];
function tempMigrationsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "migrations-"));
  tempDirs.push(dir);
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("runMigrations", () => {
  it("applies the project migrations once and is a no-op on re-run", () => {
    const db = openDatabase(":memory:");
    expect(currentMigrationVersion(db)).toBe(0);

    const first = runMigrations(db);
    expect(first.applied.map((m) => m.version)).toEqual([1]);
    expect(first.version).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'app_meta'").get()).toBeTruthy();

    const second = runMigrations(db);
    expect(second.applied).toEqual([]);
    expect(second.version).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()).toEqual({ n: 1 });
  });

  it("applies only migrations newer than the current version, in order", () => {
    const dir = tempMigrationsDir({
      "0002_second.sql": "CREATE TABLE b (id INTEGER);",
      "0001_first.sql": "CREATE TABLE a (id INTEGER);",
      "README.txt": "ignored",
    });
    const db = openDatabase(":memory:");
    expect(runMigrations(db, dir).applied.map((m) => m.name)).toEqual(["first", "second"]);

    writeFileSync(join(dir, "0003_third.sql"), "CREATE TABLE c (id INTEGER);");
    const result = runMigrations(db, dir);
    expect(result.applied.map((m) => m.version)).toEqual([3]);
    expect(result.version).toBe(3);
  });

  it("rolls back a failing migration without recording it", () => {
    const dir = tempMigrationsDir({
      "0001_ok.sql": "CREATE TABLE a (id INTEGER);",
      "0002_bad.sql": "CREATE TABLE b (id INTEGER); THIS IS NOT SQL;",
    });
    const db = openDatabase(":memory:");
    expect(() => runMigrations(db, dir)).toThrow();
    expect(currentMigrationVersion(db)).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined();
  });

  it("rejects badly named and duplicate migration files", () => {
    expect(() => loadMigrations(tempMigrationsDir({ "1_bad.sql": "" }))).toThrow(/NNNN_name/);
    expect(() =>
      loadMigrations(tempMigrationsDir({ "0001_a.sql": "", "0001_b.sql": "" })),
    ).toThrow(/Duplicate/);
  });
});
