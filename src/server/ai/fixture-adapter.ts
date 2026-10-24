import { isDeepStrictEqual } from "node:util";
import {
  checklistInputSchema,
  patientSchema,
  type ChecklistInput,
  type Patient,
  type TrialInput,
} from "../../lib/schemas/ai";
import { fixtureWithReplies } from "../workflow/demo-replies";
import type { AgentObserver, OutreachInput } from "./contracts";
import type { AiAdapter, UnresolvedRule } from "./contracts";
import {
  buildDemoCohort,
  demoChecklist,
  demoTrial,
  DEMO_TIME,
} from "./fixtures";
import { GapSession } from "./gap-tools";

/** Exact fixture replay, not an alternative screening engine. Unknown/edited inputs fail closed. */
export class FixtureAdapter implements AiAdapter {
  readonly mode = "fixture" as const;
  readonly label = "Fixture simulation · no AI call";
  constructor(private readonly clock: () => Date = () => new Date(DEMO_TIME)) {}
  async extract(trial: TrialInput) {
    if (
      trial.id !== demoTrial.id ||
      trial.criteriaText !== demoTrial.criteriaText
    ) {
      throw new Error(
        "No extraction fixture for this trial snapshot. Select live mode or restore the demo snapshot.",
      );
    }
    return structuredClone(demoChecklist);
  }
  async screen(input: Patient, approved: ChecklistInput) {
    const patient = patientSchema.parse(input);
    const checklist = checklistInputSchema.parse(approved);
    const fixture = buildDemoCohort(this.clock).find(
      (item) => item.patient.id === patient.id,
    );
    const replyProposals = fixtureWithReplies(patient);
    if (
      replyProposals &&
      checklist.trialId === demoTrial.id &&
      isDeepStrictEqual(checklist.rules, demoChecklist.rules)
    )
      return replyProposals;
    if (
      !fixture ||
      !isDeepStrictEqual(patient, fixture.patient) ||
      checklist.trialId !== demoTrial.id ||
      !isDeepStrictEqual(checklist.rules, demoChecklist.rules)
    ) {
      throw new Error(
        "No exact screening fixture for these inputs. Edited charts/checklists require live screening.",
      );
    }
    return structuredClone(fixture.proposals);
  }
  async runGapInvestigation(
    patient: Patient,
    unresolvedRules: UnresolvedRule[],
    observer?: AgentObserver,
  ) {
    const session = new GapSession(
      patient,
      unresolvedRules.map((r) => r.id),
    );
    const execute = (
      name: Parameters<GapSession["execute"]>[0],
      args: unknown,
    ) => {
      const result = session.execute(name, args);
      observer?.step(session.actions.at(-1)!);
      return result;
    };
    for (const rule of unresolvedRules.slice(0, 2)) {
      execute("get_latest", {
        query:
          rule.id === "brain_imaging" ? "MRI" : rule.id.replaceAll("_", " "),
      });
      execute("draft_records_request", {
        ruleId: rule.id,
        request: `Please provide the latest existing ${rule.id === "brain_imaging" ? "brain imaging report" : rule.id === "hemoglobin" ? "hemoglobin result" : "record for " + rule.id.replaceAll("_", " ")}, including its observation date and source. This is a simulated request for records, not a new test order.`,
      });
    }
    execute("finish", {
      summary:
        "Fixture simulation completed. Review the drafted requests; no model selected these tools.",
    });
    return session.trail("fixture", null);
  }
  async draftOutreach(input: OutreachInput, observer?: AgentObserver) {
    const citations = input.result.rules
      .filter((r) => r.status === "met" && !r.review)
      .flatMap((r) => r.citations)
      .slice(0, 3);
    observer?.step({
      sequence: 1,
      tool: "read_verified_case",
      arguments: {},
      outcome: "ok",
      result: { records: citations },
    });
    const summaries: Record<string, string> = {
      English:
        "Your care team is reviewing a research study that may be an option for you. Joining is your choice. More checks are needed before you can join. Ask your care team about the study, its risks, other options, and what visits would involve. Benefits are not guaranteed.",
      Spanish:
        "Su equipo de atención está revisando un estudio que podría ser una opción para usted. Participar es su decisión. Se necesitan más evaluaciones antes de participar. Pregunte sobre los riesgos, otras opciones y las visitas. No se garantizan beneficios.",
      Portuguese:
        "Sua equipe de saúde está avaliando um estudo que pode ser uma opção para você. Participar é uma escolha sua. São necessárias outras avaliações. Pergunte sobre riscos, outras opções e consultas. Não há garantia de benefício.",
      "Haitian Creole":
        "Ekip swen ou ap egzamine yon etid ki ka yon opsyon pou ou. Se ou ki chwazi si ou vle patisipe. Gen lòt verifikasyon ki nesesè. Mande ekip ou sou risk yo, lòt opsyon yo ak vizit yo. Pa gen garanti benefis.",
    };
    return {
      physician: `To ${input.patient.clinician}: Please discuss ${input.trialId} with this synthetic patient at their next visit. Supported chart findings: ${citations.map((c) => c.quote).join(" ")} Coordinator review: ${input.reviewNote}. Formal eligibility and consent checks remain pending. This is a fixture draft for simulated delivery only.`,
      summary: summaries[input.language]!,
      citedLineIds: citations.map((c) => c.lineId),
    };
  }
}
