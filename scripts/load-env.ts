import { existsSync } from "node:fs";
import { parseServerEnv, type ServerEnv } from "../src/lib/schemas/env";

/**
 * Loads `.env` (if present) the same way Next.js does for the app, then
 * validates it. Values are never printed.
 */
export function loadScriptEnv(): ServerEnv {
  if (existsSync(".env")) process.loadEnvFile(".env");
  return parseServerEnv(process.env);
}
