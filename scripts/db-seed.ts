import { openDatabase } from "../src/server/db/connection";
import { seedDatabase } from "../src/server/db/seed";
import { loadScriptEnv } from "./load-env";

const env = loadScriptEnv();
const db = openDatabase(env.DATABASE_PATH, { fileMustExist: true });
try {
  const { inserted } = seedDatabase(db);
  console.log(
    inserted === 0
      ? "Seed already applied; nothing inserted."
      : `Seeded synthetic demo data (${inserted} rows inserted).`,
  );
} finally {
  db.close();
}
