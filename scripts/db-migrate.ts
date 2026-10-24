import { openDatabase } from "../src/server/db/connection";
import { runMigrations } from "../src/server/db/migrate";
import { loadScriptEnv } from "./load-env";

const env = loadScriptEnv();
const db = openDatabase(env.DATABASE_PATH);
try {
  const { applied, version } = runMigrations(db);
  if (applied.length === 0) {
    console.log(`No pending migrations. Schema version ${version} (${env.DATABASE_PATH}).`);
  } else {
    for (const m of applied) console.log(`Applied ${String(m.version).padStart(4, "0")}_${m.name}`);
    console.log(`Schema version ${version} (${env.DATABASE_PATH}).`);
  }
} finally {
  db.close();
}
