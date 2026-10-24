"use client";
import { useState } from "react";
import type { PatientView, WorkflowView } from "../../lib/workflow";
import {
  languages,
  outreachStages,
  stageLabel,
  type JourneyItem,
  type AgentRun,
  type OutreachCase,
} from "../../lib/journey";
import { patientName, patientStatus, formatDate, clinicianName } from "./presentation";
import { EvidenceWorkspace } from "./evidence";
type Act = (body: object, message: string) => Promise<void>;
const itemLabels = {
  request: "Records request",
  question: "Coordinator question",
  physician: "Note to the doctor",
  summary: "Patient summary for the care team",
  reminder: "Follow-up reminder",
};

export function PatientJourney({
  patient,
  view,
  busy,
  act,
  onBack,
}: {
  patient: PatientView;
  view: WorkflowView;
  busy: boolean;
  act: Act;
  onBack(): void;
}) {
  const [mode, setMode] = useState<"live" | "fixture">("live");
  const [language, setLanguage] = useState<string>("English"),
    [note, setNote] = useState("");
  const s = patient.screening,
    current = !!s && !s.stale;
  const runs = (view.journey?.runs ?? []).filter(
    (r) => r.patientId === patient.id,
  );
  const currentRuns = runs.filter((r) => !r.stale);
  const items = (view.journey?.items ?? []).filter(
    (i) => i.patientId === patient.id && !i.stale,
  );
  const review = view.journey?.cases.find(
    (c) => c.patientId === patient.id && !c.stale,
  );
  const gap = currentRuns.find((r) => r.kind === "gap");
  const active = currentRuns.some((r) =>
    ["queued", "running"].includes(r.state),
  );
  const pending = items.filter(
    (i) =>
      i.state === "pending" || (i.kind === "request" && i.state === "approved"),
  );
  const canReview =
    current &&
    ["likely_match", "needs_review"].includes(s.result.status) &&
    (!review || review.decision === "snoozed");
  const stage =
    review?.decision === "verified"
      ? review.stage === "drafts"
        ? 3
        : 4
      : canReview
        ? 2
        : current && s.result.status !== "ruled_out"
          ? 1
          : 0;
  const stageNames = [
    "Screen",
    "Investigate",
    "Review",
    "Outreach",
    "Follow up",
  ];
  return (
    <div className="journey">
      <button className="btn btn--quiet journey-back" onClick={onBack}>
        ← All patients
      </button>
      <header className="journey-heading">
        <div>
          <p className="eyebrow">Patient journey</p>
          <h1 tabIndex={-1}>{patientName(patient.id)}</h1>
          <p>
            {patient.diagnosis} · {clinicianName(patient.id, patient.clinician)} · Visit {formatDate(patient.nextVisit)}
          </p>
        </div>
        <span className="status status--info">
          {review?.decision === "verified"
            ? stageLabel[review.stage]
            : patientStatus(patient)}
        </span>
      </header>
      <ol className="journey-stages" aria-label="Patient journey">
        {stageNames.map((name, i) => (
          <li key={name} aria-current={i === stage ? "step" : undefined}>
            <span>{i < stage ? "✓" : i + 1}</span>
            {name}
          </li>
        ))}
      </ol>
      <div className="journey-columns">
        <section className="journey-main" aria-label="Next action">
          {!current && (
            <section className="card journey-panel">
              <h2>
                {view.pending
                  ? "Screening updated records…"
                  : "Review the current trial checklist"}
              </h2>
              <p>Actions unlock when the patient has a current screening.</p>
              <a className="btn" href="/criteria">
                Open trial checklist
              </a>
            </section>
          )}
          {current && (
            <section className="card journey-panel">
              <p className="eyebrow">Next step</p>
              <h2>
                {active
                  ? "The agent is working"
                  : pending.length
                    ? "Your review is needed"
                    : review?.decision === "verified"
                      ? "Keep the care team in the loop"
                      : canReview
                        ? "Review this potential match"
                        : s.result.status === "ruled_out"
                          ? "This patient is not a match right now"
                          : "Find the missing information"}
              </h2>
              <p>
                {active
                  ? "Completed tool actions appear in the activity panel as they finish."
                  : s.result.reason}
              </p>
              {!review && (!gap || canReview) && (
                <label className="journey-mode">
                  Agent mode
                  <select
                    className="select"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as typeof mode)}
                    disabled={active || busy}
                  >
                    <option value="live">Live Luna · uses API credits</option>
                    <option value="fixture">
                      Sample run · no AI calls
                    </option>
                  </select>
                </label>
              )}
              {!gap &&
                !review &&
                ["needs_info", "needs_review"].includes(s.result.status) && (
                  <button
                    className="btn btn--primary"
                    disabled={busy || active || !view.demoMode}
                    onClick={() =>
                      act(
                        {
                          action: "investigate",
                          patientId: patient.id,
                          screeningId: s.id,
                          mode,
                        },
                        "Investigation queued. Watch the activity panel for tool results.",
                      )
                    }
                  >
                    Investigate gaps
                  </button>
                )}
              {gap?.state === "completed" && !pending.length && !canReview && (
                <p>
                  The investigation finished. Open the activity details to
                  review its findings.
                </p>
              )}
              {s.result.status === "ruled_out" && (
                <p>
                  Review the cited exclusion in the evidence below. Outreach is
                  unavailable.
                </p>
              )}
              {review && review.decision !== "verified" && (
                <p>
                  Coordinator decision: {review.decision}. {review.reviewNote}
                </p>
              )}
            </section>
          )}
          {pending.map((item) => (
            <ReviewItem
              key={`${item.id}:${item.revision}`}
              item={item}
              busy={busy || !view.demoMode}
              act={act}
              assessmentAt={view.assessmentAt}
            />
          ))}
          {canReview && !active && (
            <section className="card journey-panel">
              <h2>Coordinator review</h2>
              <p>
                Review the evidence below, including unresolved findings and
                visit checks. Verification records your assessment of a
                potential match; formal eligibility is still unconfirmed.
              </p>
              <label>
                Review note
                <textarea
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Explain the evidence you reviewed and any remaining checks."
                  maxLength={2000}
                />
              </label>
              <label>
                Patient-summary language
                <select
                  className="select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {languages.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
              <div className="journey-actions">
                <button
                  className="btn btn--primary"
                  disabled={busy || note.trim().length < 10 || !view.demoMode}
                  onClick={() =>
                    act(
                      {
                        action: "review_match",
                        patientId: patient.id,
                        screeningId: s!.id,
                        decision: "verified",
                        note,
                        language,
                        mode,
                      },
                      "Review saved. The agent will prepare outreach drafts.",
                    )
                  }
                >
                  Verify & draft outreach
                </button>
                <button
                  className="btn"
                  disabled={busy || note.trim().length < 10 || !view.demoMode}
                  onClick={() =>
                    act(
                      {
                        action: "review_match",
                        patientId: patient.id,
                        screeningId: s!.id,
                        decision: "rejected",
                        note,
                        language,
                        mode,
                      },
                      "Review saved.",
                    )
                  }
                >
                  Not a match
                </button>
              </div>
            </section>
          )}
          {review?.decision === "verified" && (
            <FollowUp review={review} busy={busy || !view.demoMode} act={act} />
          )}
          {items.some((i) =>
            ["approved", "answered", "declined"].includes(i.state),
          ) && (
            <details className="disclosure">
              <summary>Reviewed actions</summary>
              <div className="disclosure-body">
                {items
                  .filter((i) =>
                    ["approved", "answered", "declined"].includes(i.state),
                  )
                  .map((i) => (
                    <div className="journey-receipt" key={i.id}>
                      <strong>
                        {itemLabels[i.kind]} · {i.state}
                      </strong>
                      <p>{i.body}</p>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </section>
        <aside className="journey-agent" aria-label="Agent activity">
          <div className="journey-agent-head">
            <h2>Agent activity</h2>
            <span>{active ? "● Working" : "Saved actions"}</span>
          </div>
          <p className="journey-caption">
            Records checked, requests prepared, and next steps saved.
          </p>
          {runs.length ? (
            runs
              .slice()
              .reverse()
              .map((run, index) =>
                index === 0 ? (
                  <AgentActivity
                    key={run.id}
                    run={run}
                    busy={busy || !view.demoMode}
                    act={act}
                  />
                ) : (
                  <details key={run.id} className="agent-history">
                    <summary>
                      Previous{" "}
                      {run.kind === "gap" ? "investigation" : "outreach run"} ·{" "}
                      {run.mode}
                    </summary>
                    <AgentActivity
                      run={run}
                      busy={busy || !view.demoMode}
                      act={act}
                    />
                  </details>
                ),
              )
          ) : (
            <div className="journey-idle">
              <span aria-hidden="true">◎</span>
              <p>
                Start an investigation or verify a potential match to see the
                agent work.
              </p>
            </div>
          )}
        </aside>
      </div>
      <details className="disclosure journey-evidence">
        <summary>
          Evidence & trial criteria{" "}
          <span className="cell-sub">Sources, dates and remaining checks</span>
        </summary>
        <div className="disclosure-body">
          <EvidenceWorkspace patient={patient} view={view} onBack={onBack} />
        </div>
      </details>
      <details className="disclosure">
        <summary>Walkthrough controls & history</summary>
        <div className="disclosure-body">
          <p>
            Advance the walkthrough clock or review earlier activity.
            Advancing the follow-up clock creates due reminder drafts and does
            not change clinical assessment dates.
          </p>
          <p>Follow-up clock: {formatDate(view.journey?.now ?? null)}</p>
          <button
            className="btn"
            disabled={busy || !view.demoMode}
            onClick={() =>
              act(
                { action: "advance_clock", days: 3 },
                "Follow-up clock advanced three days. Due reminder drafts are ready for review.",
              )
            }
          >
            Advance follow-up by 3 days
          </button>
          <p>
            <a href="/criteria">Change trial criteria</a> to demonstrate
            reapproval, re-screening and invalidation of earlier actions.
          </p>
          {(view.journey?.items ?? [])
            .filter((i) => i.patientId === patient.id && i.stale)
            .map((i) => (
              <p key={i.id}>
                {itemLabels[i.kind]} · previous inputs · {i.state}
              </p>
            ))}
        </div>
      </details>
    </div>
  );
}
function AgentActivity({
  run,
  busy,
  act,
}: {
  run: AgentRun;
  busy: boolean;
  act: Act;
}) {
  return (
    <section className="agent-run">
      <div className="agent-run-label">
        <strong>
          {run.kind === "gap" ? "Gap investigator" : "Outreach drafter"}
        </strong>
        <span>
          {run.mode === "live" ? "Live Luna" : "Sample run"} ·{" "}
          {run.stale ? "Previous inputs" : run.state}
        </span>
      </div>
      <ol className="agent-steps">
        {run.steps.map((step) => (
          <li key={step.id}>
            <span className="agent-step-dot" aria-hidden="true" />
            <div>
              <strong>{step.title}</strong>
              <p>
                {step.detail.length > 180
                  ? step.detail.slice(0, 177) + "…"
                  : step.detail}
              </p>
              {step.data != null && (
                <details>
                  <summary>Tool result</summary>
                  <pre>{JSON.stringify(step.data, null, 2)}</pre>
                </details>
              )}
            </div>
          </li>
        ))}
      </ol>
      {run.state === "queued" && <p>Waiting for the worker…</p>}
      {run.state === "running" && (
        <p role="status">
          <span className="spinner" /> Waiting for the next tool result…
        </p>
      )}
      {run.summary && (
        <p
          className={
            run.state === "failed" ? "integration-stale" : "journey-caption"
          }
        >
          {run.summary}
        </p>
      )}
      {run.usage && (
        <p className="journey-caption">
          {run.usage.model} · {run.usage.requests} request(s) ·{" "}
          {run.usage.inputTokens + run.usage.outputTokens} tokens
        </p>
      )}
      {run.state === "failed" && !run.stale && run.attempts < 2 && (
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            act(
              { action: "retry_agent", runId: run.id },
              "Retry queued. Live retries use API credits.",
            )
          }
        >
          Retry once
        </button>
      )}
    </section>
  );
}
function ReviewItem({
  item,
  busy,
  act,
  assessmentAt,
}: {
  item: JourneyItem;
  busy: boolean;
  act: Act;
  assessmentAt: string;
}) {
  const [body, setBody] = useState(item.body),
    [editing, setEditing] = useState(false),
    [answer, setAnswer] = useState(""),
    [source, setSource] = useState(""),
    [date, setDate] = useState(assessmentAt.slice(0, 10));
  const pending = item.state === "pending",
    reply =
      item.kind === "question" ||
      (item.kind === "request" && item.state === "approved");
  const demo =
    item.patientId === "synthetic-03" &&
    ["hemoglobin", "brain_imaging"].includes(item.ruleId ?? "");
  return (
    <section className="card journey-panel">
      <p className="eyebrow">
        {item.mode === "fixture"
          ? "Prepared draft"
          : item.mode === "live"
            ? "Luna draft"
            : "System draft"}{" "}
        · {item.state}
      </p>
      <h2>{itemLabels[item.kind]}</h2>
      {editing ? (
        <label>
          Edit draft
          <textarea
            className="input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
          />
        </label>
      ) : (
        <p className="journey-draft">{item.body}</p>
      )}
      {pending && item.kind !== "question" && (
        <div className="journey-actions">
          {editing ? (
            <>
              <button
                className="btn btn--primary"
                disabled={busy || !body.trim()}
                onClick={() =>
                  act(
                    {
                      action: "item",
                      id: item.id,
                      revision: item.revision,
                      decision: "edit",
                      body,
                    },
                    "Draft updated. Review the new text before approving.",
                  )
                }
              >
                Save draft
              </button>
              <button className="btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn--primary"
                disabled={busy}
                onClick={() =>
                  act(
                    {
                      action: "item",
                      id: item.id,
                      revision: item.revision,
                      decision: "approve",
                    },
                    item.kind === "summary"
                      ? "Care-team handoff approved."
                      : "Approval saved in this workspace.",
                  )
                }
              >
                {item.kind === "summary"
                  ? "Approve care-team handoff"
                  : item.kind === "physician" ? "Approve physician note" : item.kind === "reminder" ? "Approve reminder" : "Approve request"}
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
              <button
                className="btn btn--quiet"
                disabled={busy}
                onClick={() =>
                  act(
                    {
                      action: "item",
                      id: item.id,
                      revision: item.revision,
                      decision: "decline",
                    },
                    "Draft declined.",
                  )
                }
              >
                Decline
              </button>
            </>
          )}
        </div>
      )}
      {reply && (
        <>
          <p className="journey-caption">
            {item.kind === "request"
              ? "Awaiting records. Approve both requests before receiving the replies."
              : "Add evidence with a source and observation date."}
          </p>
          {demo && item.kind === "request" && (
            <button
              className="btn btn--primary"
              disabled={busy}
              onClick={() =>
                act(
                  {
                    action: "demo_reply",
                    id: item.id,
                    revision: item.revision,
                  },
                  "Records received. Re-screening this patient now.",
                )
              }
            >
              Receive records
            </button>
          )}
          <details>
            <summary>Add a record manually</summary>
            <div className="journey-form">
              <label>
                Evidence
                <textarea
                  className="input"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  maxLength={3000}
                />
              </label>
              <label>
                Source
                <input
                  className="input"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  maxLength={200}
                />
              </label>
              <label>
                Observed on
                <input
                  type="date"
                  className="input"
                  value={date}
                  max={assessmentAt.slice(0, 10)}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <button
                className="btn"
                disabled={
                  busy ||
                  answer.trim().length < 5 ||
                  source.trim().length < 3 ||
                  !date
                }
                onClick={() =>
                  act(
                    {
                      action: "reply",
                      id: item.id,
                      revision: item.revision,
                      text: answer,
                      source,
                      observedAt: new Date(date + "T00:00:00Z").toISOString(),
                    },
                    "Evidence appended. Re-screening is queued.",
                  )
                }
              >
                Save evidence & re-screen
              </button>
            </div>
          </details>
        </>
      )}
      {item.kind === "summary" && <p className="journey-caption">
        Translation draft · Care-team review required.
      </p>}
    </section>
  );
}
function FollowUp({
  review,
  busy,
  act,
}: {
  review: OutreachCase;
  busy: boolean;
  act: Act;
}) {
  const [note, setNote] = useState("");
  const next =
    outreachStages[
      outreachStages.indexOf(review.stage as (typeof outreachStages)[number]) +
        1
    ];
  const [choice, setChoice] = useState("");
  const terminal = [
    "enrolled",
    "patient_declined",
    "doctor_declined",
    "screen_failed",
    "trial_closed",
  ].includes(review.stage);
  return (
    <section className="card journey-panel">
      <p className="eyebrow">Care-team follow-up</p>
      <h2>{stageLabel[review.stage]}</h2>
      <p>
        Outcomes are recorded by a person. The agent does not infer consent or
        enrollment.
      </p>
      {review.stage !== "drafts" && !terminal && (
        <>
          <label>
            Observed outcome
            <select
              className="select"
              value={choice || next}
              onChange={(e) => setChoice(e.target.value)}
            >
              {next && <option value={next}>{stageLabel[next]}</option>}
              {[
                "patient_declined",
                "doctor_declined",
                "screen_failed",
                "trial_closed",
              ].map((s) => (
                <option key={s} value={s}>
                  {stageLabel[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source or note
            <input
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Record who confirmed this outcome."
              maxLength={1000}
            />
          </label>
          <button
            className="btn"
            disabled={busy || note.trim().length < 3}
            onClick={async () => {
              await act(
                {
                  action: "outcome",
                  screeningId: review.screeningId,
                  revision: review.revision,
                  stage: choice || next,
                  note,
                },
                "Human-entered outcome saved.",
              );
              setChoice("");
              setNote("");
            }}
          >
            Record outcome
          </button>
        </>
      )}
    </section>
  );
}
export function JourneyQueue({
  view,
  kind,
  onOpen,
}: {
  view: WorkflowView;
  kind: "Inbox" | "Outreach";
  onOpen(id: string): void;
}) {
  const items = (view.journey?.items ?? []).filter(
    (i) =>
      !i.stale &&
      (i.state === "pending" ||
        (i.kind === "request" && i.state === "approved")),
  );
  const cases = (view.journey?.cases ?? []).filter(
    (c) => !c.stale && c.decision === "verified",
  );
  return (
    <section className="card journey-panel">
      <h2>
        {kind === "Inbox" ? "Ready for your review" : "Care-team outreach"}
      </h2>
      <p>
        {kind === "Inbox"
          ? "Review drafts and add replies. Each action stays connected to the patient's evidence."
          : "Track approved outreach and record what happens next."}
      </p>
      <ul className="list">
        {kind === "Inbox"
          ? items.map((i) => (
              <li key={i.id}>
                <button
                  className="list-row list-row--button"
                  onClick={() => onOpen(i.patientId)}
                >
                  <strong>{patientName(i.patientId)}</strong>
                  <span>
                    {itemLabels[i.kind]} · {i.state}
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              </li>
            ))
          : cases.map((c) => (
              <li key={c.screeningId}>
                <button
                  className="list-row list-row--button"
                  onClick={() => onOpen(c.patientId)}
                >
                  <strong>{patientName(c.patientId)}</strong>
                  <span>{stageLabel[c.stage]}</span>
                  <span aria-hidden="true">→</span>
                </button>
              </li>
            ))}
      </ul>
      {(kind === "Inbox" ? !items.length : !cases.length) && (
        <p>
          {kind === "Inbox"
            ? "No pending actions. Open a patient to start an investigation."
            : "Verify a potential match to prepare the first outreach drafts."}
        </p>
      )}
    </section>
  );
}
