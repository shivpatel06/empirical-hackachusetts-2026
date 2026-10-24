import "server-only";
import { parseServerEnv, type ServerEnv } from "../lib/schemas/env";

let cached: ServerEnv | undefined;

/** Validated server environment. Importing this from client code fails the build. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
