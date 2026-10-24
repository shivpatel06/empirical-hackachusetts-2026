import { describe, expect, it } from "vitest";
import type { PatientView, ScreeningStatus } from "../../lib/workflow";
import { currentStatus, patientStatus, visiblePatients } from "./presentation";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceWorkspace } from "./evidence";
import type { WorkflowView } from "../../lib/workflow";

function patient(
  id: string,
  status: ScreeningStatus,
  stale = false,
  nextVisit: string | null = "2026-10-26T14:00:00Z",
): PatientView {
  return {
    id,
    synthetic: true,
    diagnosis: "NSCLC",
    clinician: "Synthetic clinician",
    nextVisit,
    revision: 1,
    chart: [],
    outsideRecords: [],
    job: null,
    screening: {
      id: 1,
      checklistId: 1,
      chartRevision: 1,
      mode: "fixture",
      stale,
      createdAt: "2026-10-24T14:00:00Z",
      result: {
        status,
        reason: "Fixture",
        rules: [],
        pendingVisit: [],
        evaluatedAt: "2026-10-24T14:00:00Z",
        prefilter: null,
      },
    },
  };
}
describe("Empirical server-result presentation", () => {
  it("shows a supported measurement with a model disagreement in the attention view", () => {
    const p = patient("patient-01", "needs_review");
    p.screening!.result.rules = [
      {
        ruleId: "hemoglobin",
        status: "met",
        review: true,
        reason: "Model failure disagrees with measured hemoglobin.",
        citations: [],
        proposedStatus: "not_met",
        provenanceVerified: true,
        support: "numeric",
      },
      {
        ruleId: "history",
        status: "unknown",
        review: false,
        reason: "History missing.",
        citations: [],
        proposedStatus: "unknown",
        provenanceVerified: false,
        support: "none",
      },
    ];
    const view: WorkflowView = {
      mode: "fixture",
      demoMode: true,
      assessmentAt: "2026-10-24T14:00:00Z",
      trial: null,
      trials: [],
      checklist: null,
      patients: [p],
      activity: [],
      pending: 0,
    };
    const html = renderToStaticMarkup(
      createElement(EvidenceWorkspace, { patient: p, view, onBack() {} }),
    );
    expect(html).toContain("Model failure disagrees with measured hemoglobin.");
    expect(html).toContain("1 · Needs review");
    expect(html).toContain("0 supported");
  });
  it("never counts a stale match as a current match", () => {
    const stale = patient("patient-01", "likely_match", true);
    expect(currentStatus(stale)).toBeNull();
    expect(patientStatus(stale)).toBe("Outdated result");
    expect(visiblePatients([stale], "all", "", "likely_match")).toEqual([]);
  });
  it("keeps outdated exclusions in the worklist rather than the current archive", () => {
    const stale = patient("patient-01", "ruled_out", true),
      current = patient("patient-02", "ruled_out");
    expect(
      visiblePatients([stale, current], "archive").map((p) => p.id),
    ).toEqual([current.id]);
    expect(
      visiblePatients([stale, current], "worklist").map((p) => p.id),
    ).toEqual([stale.id]);
  });
  it("orders missing visits last without mutating server data", () => {
    const rows = [
      patient("patient-01", "needs_info", false, null),
      patient("patient-02", "needs_info"),
    ];
    expect(visiblePatients(rows, "all").map((p) => p.id)).toEqual([
      "patient-02",
      "patient-01",
    ]);
    expect(rows[0]?.id).toBe("patient-01");
  });
  it("preserves an unscreened failure instead of inventing a result", () => {
    const failed = {
      ...patient("patient-01", "needs_info"),
      screening: null,
      job: { id: 1, state: "failed", error: "Provider unavailable" },
    };
    expect(patientStatus(failed)).toBe("Screening failed");
    expect(
      visiblePatients([failed], "worklist", "synthetic clinician"),
    ).toEqual([failed]);
    expect(visiblePatients([failed], "all", "", "needs_info")).toEqual([]);
  });
});
