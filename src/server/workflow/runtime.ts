import "server-only";
import { getDb } from "../db";
import { getServerEnv } from "../env";
import { getAiAdapter } from "../ai";
import { WorkflowStore } from "./store";
export const workflow = () =>
  new WorkflowStore(getDb(), getServerEnv().AI_MODE);
const worker = globalThis as unknown as {
  trialWorker?: Promise<void>;
  trialWorkerInitialized?: boolean;
};
export function drainQueue(): Promise<void> {
  if (!getServerEnv().DEMO_MODE) return Promise.resolve();
  if (worker.trialWorker) return worker.trialWorker;
  worker.trialWorker = (async () => {
    const store = workflow();
    // One persistent Node process owns this demo worker. On process restart,
    // interrupted attempts are made visible, never silently marked complete.
    if (!worker.trialWorkerInitialized) {
      store.db
        .prepare(
          "UPDATE events SET state='failed',error='Server restarted during screening. Retry this job.' WHERE state='processing'",
        )
        .run();
      worker.trialWorkerInitialized = true;
    }
    let mode;
    while ((mode = store.nextQueuedMode())) {
      let adapter;
      try {
        adapter = await getAiAdapter(mode);
      } catch {
        store.failQueuedMode(mode);
        continue;
      }
      await store.processNext(adapter);
    }
  })()
    .catch(() => {
      // DB/worker errors remain visible as queued/processing. The next poll retries
      // queued work; processNext owns bounded per-job failures.
    })
    .finally(() => {
      worker.trialWorker = undefined;
    });
  return worker.trialWorker;
}
