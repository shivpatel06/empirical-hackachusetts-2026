import type {
  ChecklistDraft,
  Patient,
  RuleOutput,
  TrialInput,
} from "./schemas/ai";

export type ScreeningStatus =
  | "likely_match"
  | "needs_info"
  | "needs_review"
  | "ruled_out";
export interface CheckedRule {
  ruleId: string;
  status: "met" | "not_met" | "unknown" | "pending";
  reason: string;
  review: boolean;
  citations: RuleOutput["citations"];
  proposedStatus: string | null;
  provenanceVerified: boolean;
  support: "numeric" | "synthetic_assertion" | "none";
}
export interface ScreeningResult {
  status: ScreeningStatus;
  reason: string;
  rules: CheckedRule[];
  pendingVisit: string[];
  evaluatedAt: string;
  prefilter: string | null;
}
export interface StoredChecklist extends ChecklistDraft {
  id: number;
  trialId: string;
  version: number;
  revision: number;
  state: "draft" | "approved" | "superseded";
  mode: "fixture" | "live";
  approvedAt: string | null;
  approvedBy: string | null;
}
export interface TrialView extends TrialInput {
  localOpen: boolean;
  recruitingStatus: string;
  fetchedAt: string;
  conditions: string[];
  phases: string[];
  updatedAt: string | null;
  minimumAge: string | null;
  maximumAge: string | null;
  sex: string | null;
}
export interface PatientView extends Patient {
  screening: {
    id: number;
    checklistId: number;
    chartRevision: number;
    mode: "live" | "fixture";
    stale: boolean;
    createdAt: string;
    result: ScreeningResult;
  } | null;
  job: { id: number; state: string; error: string | null } | null;
}
export interface WorkflowView {
  mode: "live" | "fixture";
  demoMode: boolean;
  assessmentAt: string;
  trial: TrialView | null;
  trials: { id: string; title: string }[];
  checklist: StoredChecklist | null;
  patients: PatientView[];
  activity: {
    id: number;
    actor: string;
    action: string;
    detail: string;
    createdAt: string;
  }[];
  pending: number;
}
