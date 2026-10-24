import { z } from "zod";
export const languages = [
  "English",
  "Spanish",
  "Portuguese",
  "Haitian Creole",
] as const;
export const outreachStages = [
  "doctor_notified",
  "doctor_responded",
  "doctor_agreed",
  "patient_contacted",
  "discussed_at_visit",
  "patient_interested",
  "consent_visit_scheduled",
  "consented",
  "formal_screening",
  "enrolled",
] as const;
export const stageLabel: Record<string, string> = {
  drafts: "Preparing outreach",
  doctor_notified: "Physician note approved",
  doctor_responded: "Doctor responded",
  doctor_agreed: "Doctor agreed",
  patient_contacted: "Patient contact approved",
  discussed_at_visit: "Discussed at visit",
  patient_interested: "Patient interested",
  consent_visit_scheduled: "Consent visit scheduled",
  consented: "Consented",
  formal_screening: "Formal screening",
  enrolled: "Enrolled",
  patient_declined: "Patient declined",
  doctor_declined: "Doctor declined",
  screen_failed: "Screen failed",
  trial_closed: "Trial closed",
};
export const outreachDraftSchema = z
  .object({
    physician: z.string().min(1).max(4000),
    summary: z.string().min(1).max(3000),
    citedLineIds: z.array(z.string()).min(1).max(15),
  })
  .strict();
export type OutreachDraft = z.infer<typeof outreachDraftSchema>;
export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  requests: number;
  model: string;
}
export interface AgentStep {
  id: number;
  title: string;
  detail: string;
  data: unknown;
  createdAt: string;
}
export interface AgentRun {
  id: number;
  patientId: string;
  screeningId: number;
  kind: "gap" | "outreach";
  mode: "live" | "fixture";
  state: string;
  summary: string;
  language: string;
  attempts: number;
  stale: boolean;
  usage: AgentUsage | null;
  steps: AgentStep[];
}
export interface JourneyItem {
  id: number;
  patientId: string;
  screeningId: number;
  kind: "request" | "question" | "physician" | "summary" | "reminder";
  body: string;
  ruleId: string | null;
  revision: number;
  state: string;
  stale: boolean;
  replyLineId: string | null;
  mode: "live" | "fixture" | null;
}
export interface OutreachCase {
  screeningId: number;
  patientId: string;
  decision: string;
  reviewNote: string;
  stage: string;
  revision: number;
  stale: boolean;
}
export interface JourneyView {
  runs: AgentRun[];
  items: JourneyItem[];
  cases: OutreachCase[];
  now: string;
}
export const journeyActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("investigate"),
      patientId: z.string(),
      screeningId: z.number().int(),
      mode: z.enum(["live", "fixture"]),
    })
    .strict(),
  z
    .object({ action: z.literal("retry_agent"), runId: z.number().int() })
    .strict(),
  z
    .object({
      action: z.literal("review_match"),
      patientId: z.string(),
      screeningId: z.number().int(),
      decision: z.enum(["verified", "rejected", "snoozed"]),
      note: z.string().trim().min(10).max(2000),
      language: z.enum(languages),
      mode: z.enum(["live", "fixture"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("item"),
      id: z.number().int(),
      revision: z.number().int(),
      decision: z.enum(["approve", "decline", "edit"]),
      body: z.string().trim().min(1).max(4000).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("reply"),
      id: z.number().int(),
      revision: z.number().int(),
      text: z.string().trim().min(5).max(3000),
      source: z.string().trim().min(3).max(200),
      observedAt: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      action: z.literal("demo_reply"),
      id: z.number().int(),
      revision: z.number().int(),
    })
    .strict(),
  z
    .object({
      action: z.literal("outcome"),
      screeningId: z.number().int(),
      revision: z.number().int(),
      stage: z.enum([
        ...outreachStages,
        "patient_declined",
        "doctor_declined",
        "screen_failed",
        "trial_closed",
      ]),
      note: z.string().trim().min(3).max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal("advance_clock"),
      days: z.number().int().min(1).max(7),
    })
    .strict(),
]);
export type JourneyAction = z.infer<typeof journeyActionSchema>;
