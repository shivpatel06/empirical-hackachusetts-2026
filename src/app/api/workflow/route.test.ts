import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ selected: "NCT06116682", selectTrial: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/server")>(), after: vi.fn(),
}));
vi.mock("../../../server/env", () => ({ getServerEnv: () => ({ DEMO_MODE: true }) }));
vi.mock("../../../server/workflow/runtime", () => ({
  workflow: () => ({ selectTrial: state.selectTrial }),
  workflowView: () => ({ trial: { id: state.selected } }), drainQueue: vi.fn(),
}));
vi.mock("../../../server/trials/import", () => ({ importTrial: vi.fn() }));
vi.mock("../../../server/ai", () => ({ getAiAdapter: vi.fn() }));
import { POST } from "./route";

const request = (body: unknown) => new NextRequest("http://localhost:3105/api/workflow", {
  method: "POST",
  headers: { origin: "http://localhost:3105", host: "localhost:3105", "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("workflow trial selection", () => {
  beforeEach(() => {
    state.selected = "NCT06116682";
    state.selectTrial.mockReset().mockImplementation((id: string) => { state.selected = id; });
  });
  it("switches from a registry trial to LUMEN-1 and back through the HTTP handler", async () => {
    for (const trialId of ["LUMEN-1", "NCT06116682", "LUMEN-1"]) {
      const response = await POST(request({ action: "select", trialId }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ trial: { id: trialId } });
      expect(state.selectTrial).toHaveBeenLastCalledWith(trialId);
    }
  });
  it("rejects malformed selection IDs and local-protocol registry extraction", async () => {
    for (const body of [
      { action: "select", trialId: "LUMEN-2" },
      { action: "select", trialId: "NCT123" },
      { action: "reextract", trialId: "LUMEN-1", id: 1, revision: 1 },
    ]) expect((await POST(request(body))).status).toBe(400);
    expect(state.selectTrial).not.toHaveBeenCalled();
  });
});
