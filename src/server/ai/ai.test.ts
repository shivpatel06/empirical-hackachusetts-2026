import { describe, expect, it } from "vitest";
import {
  Usage,
  type Model,
  type ModelRequest,
  type ModelResponse,
} from "@openai/agents";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validateDraft } from "../../lib/schemas/ai";
import { safeAiError } from "./contracts";
import { FixtureAdapter } from "./fixture-adapter";
import {
  buildDemoCohort,
  demoChecklist,
  demoTrial,
  DEMO_TIME,
} from "./fixtures";
import { GapSession } from "./gap-tools";
import { probeModels } from "./model-probe";
import { createRunner, OpenAiAdapter } from "./openai";
import provenance from "../../../fixtures/trial-prescreening/provenance.json";

const cohort = buildDemoCohort();
const patient = cohort[0]!.patient;
const checklist = {
  trialId: demoTrial.id,
  version: 1,
  state: "approved" as const,
  rules: demoChecklist.rules,
};
const unresolved = demoChecklist.rules.filter(
  (rule) => rule.id === "hemoglobin",
);

function mockAdapter(
  reply: (
    request: ModelRequest,
    call: number,
  ) => ModelResponse | Promise<ModelResponse>,
) {
  let calls = 0;
  const model: Model = {
    getResponse: (request) => Promise.resolve(reply(request, ++calls)),
    async *getStreamedResponse() {
      throw new Error("Not used");
    },
  };
  return {
    adapter: new OpenAiAdapter(
      { SCREENING_MODEL: "test", GAP_MODEL: "test" },
      createRunner("not-a-key", { getModel: () => model }),
    ),
    calls: () => calls,
  };
}
function message(value: unknown): ModelResponse {
  return {
    usage: new Usage(),
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(value) }],
      },
    ],
  };
}

describe("patient-scoped gap tools", () => {
  it("rejects model-supplied patient IDs and never exposes another patient's data", () => {
    const session = new GapSession(patient, ["hemoglobin"]);
    expect(
      session.execute("search_chart", {
        query: "Hemoglobin",
        patientId: "synthetic-02",
      }),
    ).toEqual({ error: "Invalid tool arguments." });
    const result = session.execute("search_chart", { query: "Hemoglobin" });
    expect(JSON.stringify(result)).toContain("synthetic-01-hemoglobin");
    expect(JSON.stringify(result)).not.toContain("synthetic-02");
    const foreign = structuredClone(patient);
    foreign.chart[0]!.patientId = "someone-else";
    expect(() => new GapSession(foreign, [])).toThrow();
  });

  it("caps repeated/parallel invocations at six and forces a backend summary", async () => {
    const session = new GapSession(patient, ["hemoglobin"]);
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        Promise.resolve().then(() =>
          session.execute("search_chart", { query: `query ${i}` }),
        ),
      ),
    );
    expect(session.actions).toHaveLength(6);
    expect(session.trail("fixture", null)).toMatchObject({
      completion: "budget_exhausted",
      unresolvedRuleIds: ["hemoglobin"],
    });
  });

  it("bounds duplicate calls and keeps requests as drafts", () => {
    const before = structuredClone(patient);
    const session = new GapSession(patient, ["hemoglobin"]);
    const args = {
      ruleId: "hemoglobin",
      request: "Please provide existing CBC results.",
    };
    expect(session.execute("draft_records_request", args)).toMatchObject({
      sent: false,
      state: "pending_review",
    });
    session.execute("draft_records_request", args);
    expect(session.actions[1]!.outcome).toBe("duplicate");
    expect(
      session.execute("ask_coordinator", {
        ruleId: "foreign",
        question: "Approve?",
      }),
    ).toEqual({ error: "Rule is outside this investigation." });
    session.execute("finish", { summary: "Needs review" });
    session.execute("search_chart", { query: "Hemoglobin" });
    expect(session.actions).toHaveLength(4);
    expect(patient).toEqual(before);
  });

  it("finds stored outside history without inserting new chart facts", () => {
    const missing = cohort[3]!.patient;
    const session = new GapSession(missing, ["prior_systemic"]);
    expect(
      JSON.stringify(
        session.execute("check_outside_records", { query: "treatment" }),
      ),
    ).toContain("outside-prior_systemic");
    expect(session.patient.chart).toEqual(missing.chart);
  });
});

describe("actual SDK runner with deterministic test models", () => {
  it("stops a model that requests eight parallel tool actions in a single turn", async () => {
    const { adapter, calls } = mockAdapter(() => ({
      usage: new Usage(),
      responseId: "test-response",
      output: Array.from({ length: 8 }, (_, i) => ({
        type: "function_call" as const,
        callId: `call-${i}`,
        name: "search_chart",
        arguments: JSON.stringify({ query: `query-${i}` }),
      })),
    }));
    const trail = await adapter.runGapInvestigation(patient, unresolved);
    expect(trail.completion).toBe("budget_exhausted");
    expect(trail.actions).toHaveLength(6);
    expect(calls()).toBe(1);
    expect(trail.responseIds).toEqual(["test-response"]);
  });

  it("returns a safe recoverable trail for provider failure, without leaking messages", async () => {
    const { adapter } = mockAdapter(() => {
      throw Object.assign(new Error("secret-request-body"), { status: 401 });
    });
    const trail = await adapter.runGapInvestigation(patient, unresolved);
    expect(trail.completion).toBe("failed");
    expect(trail.summary).toContain("401");
    expect(JSON.stringify(trail)).not.toContain("secret-request-body");
  });

  it("uses one structured, tool-free model call per extraction/screening", async () => {
    const { adapter, calls } = mockAdapter((request, call) => {
      expect(request.tools).toEqual([]);
      if (call === 1) {
        expect(request.modelSettings.timeoutMs).toBe(180_000);
        expect(request.modelSettings.reasoning?.effort).toBe("medium");
      }
      const atomicMock = {
        rules: demoChecklist.rules.map(
          ({ sourceQuote, numeric, temporal, assessment, ...rule }, index) => ({
            ...rule,
            sourceId: `source-${index + 1}`,
            expression: {
              ...rule.expression,
              nodes: rule.expression.nodes.map((node) => ({
                ...node,
                numeric: node.operator === "condition" ? numeric : null,
                temporal: node.operator === "condition" ? temporal : null,
              })),
            },
          }),
        ),
      };
      return message(
        call === 1 ? atomicMock : { results: cohort[0]!.proposals },
      );
    });
    expect((await adapter.extract(demoTrial)).rules).toHaveLength(42);
    expect(await adapter.screen(patient, checklist)).toHaveLength(42);
    expect(calls()).toBe(2);
  });

  it("rejects an unapproved checklist before any provider call", async () => {
    const { adapter, calls } = mockAdapter(() => message({ results: [] }));
    await expect(
      adapter.screen(patient, {
        ...checklist,
        state: "draft",
      } as unknown as typeof checklist),
    ).rejects.toThrow();
    expect(calls()).toBe(0);
  });
});

describe("model selection", () => {
  it("falls back only to models with an observed successful probe", async () => {
    const called: string[] = [];
    const result = await probeModels(
      async (model) => {
        called.push(model);
        if (model !== "available")
          throw Object.assign(new Error("no access"), { status: 404 });
      },
      { screening: ["missing", "available"], gap: ["available"] },
    );
    expect(result.config).toEqual({
      SCREENING_MODEL: "available",
      GAP_MODEL: "available",
    });
    expect(called).toEqual(["missing", "available"]);
  });
  it("stops on quota failure, records no model and never silently selects fixture mode", async () => {
    const result = await probeModels(async () => {
      throw Object.assign(new Error("secret"), { status: 429 });
    });
    expect(result.config).toBeNull();
    expect(result.attempts).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(safeAiError(new Error("sk-secret"))).not.toContain("sk-secret");
  });
});

describe("snapshot and synthetic fixtures", () => {
  it("matches saved provenance hashes and retains every source paragraph", () => {
    const bytes = readFileSync("fixtures/trial-prescreening/NCT06116682.json");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      provenance.snapshotSha256,
    );
    expect(
      createHash("sha256").update(demoTrial.criteriaText).digest("hex"),
    ).toBe(provenance.criteriaSha256);
    for (const rule of demoChecklist.rules)
      expect(demoTrial.criteriaText).toContain(rule.sourceQuote);
    expect(demoChecklist.rules).toHaveLength(42);
    expect(new Set(demoChecklist.rules.map(({ id }) => id)).size).toBe(42);
  });

  it("has six distinct cases, shifts dates with the clock, and records intended failure cases", () => {
    expect(cohort).toHaveLength(6);
    expect(new Set(cohort.map((item) => item.scenario)).size).toBe(6);
    const shifted = buildDemoCohort(
      () => new Date(Date.parse(DEMO_TIME) + 86_400_000),
    );
    expect(
      Date.parse(shifted[0]!.patient.chart[0]!.observedAt) -
        Date.parse(patient.chart[0]!.observedAt),
    ).toBe(86_400_000);
    const stale = cohort[2]!.patient.chart.find(
      (line) => line.measurement?.analyte === "hemoglobin",
    )!;
    expect(
      (Date.parse(DEMO_TIME) - Date.parse(stale.observedAt)) / 86_400_000,
    ).toBe(60);
    const invalid = cohort[4]!.proposals.find(
      (rule) => rule.ruleId === "hemoglobin",
    )!;
    expect(invalid.status).toBe("not_met");
    expect(invalid.citations[0]!.lineId).toBe("synthetic-02-hemoglobin");
    expect(cohort[4]!.expectedStatus).toBe("needs_review");
  });

  it("labels fixture execution and refuses edited charts or trial snapshots", async () => {
    const adapter = new FixtureAdapter();
    expect(adapter.label).toContain("no AI call");
    expect(await adapter.screen(patient, checklist)).toEqual(
      cohort[0]!.proposals,
    );
    const changed = structuredClone(patient);
    changed.chart[0]!.text = "edited";
    await expect(adapter.screen(changed, checklist)).rejects.toThrow(
      /exact screening fixture/,
    );
    await expect(
      adapter.extract({ ...demoTrial, criteriaText: "edited" }),
    ).rejects.toThrow(/No extraction fixture/);
    const trail = await adapter.runGapInvestigation(patient, unresolved);
    expect(trail.mode).toBe("fixture");
    expect(trail.model).toBeNull();
  });

  it("rejects duplicate rules, zero-rule drafts and cyclic expressions", () => {
    expect(() => validateDraft({ rules: [] })).toThrow();
    expect(() =>
      validateDraft({
        rules: [demoChecklist.rules[0], demoChecklist.rules[0]],
      }),
    ).toThrow(/Duplicate/);
    const bad = structuredClone(demoChecklist);
    bad.rules[0]!.expression = {
      rootId: "a",
      nodes: [
        { id: "a", operator: "all", condition: null, childIds: ["a", "a"] },
      ],
    };
    expect(() => validateDraft(bad)).toThrow(/Invalid expression/);
  });
});
