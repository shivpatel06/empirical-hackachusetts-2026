import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getServerEnv } from "../env";
import { FixtureAdapter } from "./fixture-adapter";
import { createRunner, OpenAiAdapter } from "./openai";
import { modelConfigSchema, probeModels, sdkProbe } from "./model-probe";
import type { AiAdapter } from "./contracts";

const adapters = new Map<"fixture"|"live",Promise<AiAdapter>>();
/** Mode is explicit per imported trial; provider failure never switches modes. */
export function getAiAdapter(mode: "fixture"|"live" = getServerEnv().AI_MODE): Promise<AiAdapter> {
  let adapter=adapters.get(mode);
  if(!adapter){ adapter=initialize(mode).catch(error=>{adapters.delete(mode);throw error;});adapters.set(mode,adapter); }
  return adapter;
}
async function initialize(mode:"fixture"|"live"): Promise<AiAdapter> {
  const env = getServerEnv();
  if (mode === "fixture") return new FixtureAdapter();
  if (!env.OPENAI_API_KEY) throw new Error("Live AI requires OPENAI_API_KEY.");
  const runner = createRunner(env.OPENAI_API_KEY);
  const path = join(process.cwd(), "data", "model-config.json");
  if (existsSync(path)) {
    return new OpenAiAdapter(modelConfigSchema.parse(JSON.parse(readFileSync(path, "utf8"))), runner);
  }
  const result = await probeModels(sdkProbe(runner));
  if (!result.config) throw new Error(`No live model verified. ${result.attempts.map((a) => `${a.model}: ${a.detail}`).join(" ")}`);
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(path, JSON.stringify(result.config, null, 2) + "\n");
  return new OpenAiAdapter(Object.freeze(result.config), runner);
}
