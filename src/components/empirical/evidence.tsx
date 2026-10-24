"use client";
import { useState } from "react";
import type {
  CheckedRule,
  PatientView,
  WorkflowView,
} from "../../lib/workflow";
import { formatDate, patientName, patientStatus, clinicianName, recordTitle } from "./presentation";

const needsAttention = (rule: CheckedRule) =>
  rule.review || rule.status === "unknown" || rule.status === "not_met";

export function EvidenceWorkspace({
  patient,
  view,
  onBack,
}: {
  patient: PatientView;
  view: WorkflowView;
  onBack(): void;
}) {
  const screening = patient.screening;
  const [ruleId, setRuleId] = useState(
    screening?.result.rules.find(needsAttention)?.ruleId ??
      screening?.result.rules[0]?.ruleId,
  );
  const [attention, setAttention] = useState(
    !!screening?.result.rules.some(needsAttention),
  );
  const rules = screening?.result.rules ?? [];
  const rule = rules.find((r) => r.ruleId === ruleId);
  // A previous result must never be relabelled with a newer checklist's source.
  const matchingVersion = screening?.checklistId === view.checklist?.id;
  const definition = matchingVersion
    ? view.checklist?.rules.find((r) => r.id === rule?.ruleId)
    : undefined;
  const shown = rules.filter((r) => !attention || needsAttention(r));
  const label = (id: string) =>
    matchingVersion
      ? view.checklist?.rules.find((r) => r.id === id)?.qualification || id
      : id;
  const resultLabel = (status: string, review: boolean) =>
    review
      ? "Needs review"
      : status === "met"
        ? "Supported"
        : status === "not_met"
          ? "Not met"
          : status === "pending"
            ? "Verify at visit"
            : "Missing evidence";
  return (
    <div className="cw">
      <header className="cw-header">
        <div className="cw-header__bar">
          <button className="btn btn--quiet" onClick={onBack}>
            ← Back to patients
          </button>
        </div>
        <div className="cw-title">
          <h1 className="cw-name" tabIndex={-1}>
            {patientName(patient.id)}
          </h1>
          <p className="cw-dx">{patient.diagnosis}</p>
        </div>
      </header>
      <div className="cw-summary">
        <section className="card cw-statuscard">
          <div className="cw-statuscard__top">
            <strong>{patientStatus(patient)}</strong>
            <span className="cw-sub">
              {!screening
                ? "Not screened"
                : screening.mode === "live"
                  ? "Live AI proposals"
                  : "Sample screening"}
            </span>
          </div>
          <p className="integration-result">
            {screening?.result.reason ??
              "Screening findings appear after the trial checklist is approved."}
          </p>
          {screening?.stale && (
            <p className="integration-stale">
              These findings use previous inputs. Review the current checklist
              before taking action.
            </p>
          )}
          <p className="cw-sub">
            {rules.filter((r) => r.status === "met" && !r.review).length}{" "}
            supported ·{" "}
            {rules.filter((r) => r.status === "unknown" || r.review).length}{" "}
            unresolved · {screening?.result.pendingVisit.length ?? 0} visit
            checks
          </p>
        </section>
        <section className="card cw-factcard">
          <dl className="cw-facts">
            <div>
              <dt>Clinician</dt>
              <dd>{clinicianName(patient.id, patient.clinician)}</dd>
            </div>
            <div>
              <dt>Next visit</dt>
              <dd>{formatDate(patient.nextVisit)}</dd>
            </div>
            <div>
              <dt>Trial</dt>
              <dd>{view.trial?.id}</dd>
            </div>
            <div>
              <dt>Checklist</dt>
              <dd>
                {matchingVersion
                  ? `v${view.checklist?.version}`
                  : screening
                    ? "Previous version"
                    : "Not screened"}
              </dd>
            </div>
            <div>
              <dt>Chart revision used</dt>
              <dd>{screening?.chartRevision ?? "—"}</dd>
            </div>
            <div>
              <dt>Assessment</dt>
              <dd>{formatDate(screening?.result.evaluatedAt ?? null)}</dd>
            </div>
          </dl>
        </section>
      </div>
      {patient.job?.error && (
        <p className="card integration-notice error" role="alert">
          {patient.job.error}
        </p>
      )}
      {screening?.result.prefilter && (
        <p className="card integration-notice">{screening.result.prefilter}</p>
      )}
      {screening?.result.pendingVisit.length ? (
        <details className="disclosure">
          <summary>
            {screening.result.pendingVisit.length} checks remain for formal
            screening
          </summary>
          <div className="disclosure-body">
            <ul>
              {screening.result.pendingVisit.map((id) => (
                <li key={id}>{label(id)}</li>
              ))}
            </ul>
            <p>A potential match is not confirmed eligibility.</p>
          </div>
        </details>
      ) : null}
      {!screening ? (
        <section className="card integration-empty">
          <h2>No screening result yet</h2>
          <p>
            Review and approve the current trial criteria to screen this
            patient cohort.
          </p>
          <a className="btn btn--primary" href="/criteria">
            Review checklist
          </a>
        </section>
      ) : (
        <div className="cw-split">
          <section className="cw-left">
            <div className="cw-section-head cw-section-head--split">
              <h2 className="section-header">Criteria</h2>
              <button
                className="btn btn--quiet btn--sm"
                aria-pressed={attention}
                onClick={() => setAttention(!attention)}
              >
                {attention ? "Show all" : "Needs attention"}
              </button>
            </div>
            {shown.length ? (
              <ul className="cw-rules">
                {shown.map((r) => (
                  <li className="cw-rules__item" key={r.ruleId}>
                    <button
                      className={`cw-rule ${ruleId === r.ruleId ? "is-active" : ""}`}
                      aria-pressed={ruleId === r.ruleId}
                      onClick={() => {
                        setRuleId(r.ruleId);
                        if (window.matchMedia("(max-width: 1023px)").matches)
                          requestAnimationFrame(() =>
                            document
                              .getElementById("evidence-source-heading")
                              ?.focus(),
                          );
                      }}
                    >
                      <span className="cw-rule__icon" aria-hidden="true">
                        {r.review
                          ? "?"
                          : r.status === "met"
                            ? "✓"
                            : r.status === "not_met"
                              ? "×"
                              : r.status === "pending"
                                ? "○"
                                : "?"}
                      </span>
                      <span className="cw-rule__body">
                        <span className="cw-rule__top">
                          {rules.indexOf(r) + 1} ·{" "}
                          {resultLabel(r.status, r.review)}
                        </span>
                        <span className="cw-rule__text">{label(r.ruleId)}</span>
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="card empty">
                <p>No criteria need attention in this result.</p>
              </div>
            )}
            <div className="cw-decision">
              <h3>Coordinator review</h3>
              <p className="cw-hint">
                Inspect the source, date and outstanding checks. Match
                verification and record-request actions are not connected yet.
              </p>
              <a className="btn" href="/criteria">
                Open trial checklist
              </a>
            </div>
          </section>
          <section className="cw-right">
            <div className="cw-section-head">
              <h2
                className="section-header"
                id="evidence-source-heading"
                tabIndex={-1}
              >
                Source evidence
              </h2>
              <p className="cw-sub">
                {rule
                  ? resultLabel(rule.status, rule.review)
                  : "Select a criterion to inspect its evidence"}
              </p>
            </div>
            {rule && (
              <div className="cw-evidence">
                <section className="cw-ev-sec">
                  <h3 className="cw-cap">Protocol quote</h3>
                  {definition ? (
                    <blockquote className="cw-protocol__quote">
                      {definition.sourceQuote}
                    </blockquote>
                  ) : (
                    <p>
                      {matchingVersion
                        ? "No checklist rule accompanies this finding."
                        : "This result uses a previous checklist. The current protocol is not shown as its source."}
                    </p>
                  )}
                </section>
                {definition && (
                  <section className="cw-ev-sec cw-protocol__evidence">
                    <h3 className="cw-cap">Counts as evidence</h3>
                    <p>{definition.evidenceDescription}</p>
                  </section>
                )}
                <section className="cw-ev-sec cw-reason">
                  <h3 className="cw-cap">Why this result</h3>
                  <p>{rule.reason}</p>
                  {rule.conditions?.map((condition) => (
                    <div
                      className="integration-condition"
                      key={condition.nodeId}
                    >
                      <strong>
                        {condition.condition} ·{" "}
                        {resultLabel(condition.status, condition.review)}
                      </strong>
                      <p>{condition.reason}</p>
                    </div>
                  ))}
                  {rule.support === "synthetic_assertion" && (
                    <details className="cw-sub">
                      <summary>Evidence method</summary>
                      <p>Matched to a prepared sample assertion. This is not independent clinical validation.</p>
                    </details>
                  )}
                </section>
                {rule.citations.map((citation, index) => {
                  const line = patient.chart.find(
                    (l) => l.id === citation.lineId,
                  );
                  return (
                    <section
                      className="cw-ev-sec cw-doc"
                      key={`${citation.lineId}-${index}`}
                    >
                      <h3 className="cw-cap">
                        {rule.provenanceVerified && line
                          ? "Cited chart record"
                          : "Rejected / unverified citation"}
                      </h3>
                      <blockquote className="integration-quote">
                        {rule.provenanceVerified && line ? (
                          <mark>{citation.quote}</mark>
                        ) : (
                          citation.quote
                        )}
                      </blockquote>
                      {line ? (
                        <>
                          <p className="cw-sub">
                            {recordTitle(line.source, line.id)} · Observed{" "}
                            {formatDate(line.observedAt)}
                          </p>
                          {line.measurement && (
                            <p>
                              <strong>
                                {line.measurement.analyte}:{" "}
                                {line.measurement.value} {line.measurement.unit}
                              </strong>
                              {line.measurement.referenceUpper !== null &&
                                ` · Reference upper limit ${line.measurement.referenceUpper}`}
                            </p>
                          )}
                          <details>
                            <summary>Read full source</summary>
                            <p className="cw-sub">{line.source}</p>
                            <code className="integration-line-id">{citation.lineId}</code>
                            <p className="integration-chart-text">
                              {line.text}
                            </p>
                          </details>
                        </>
                      ) : (
                        <p className="cw-sub">
                          No corresponding line exists in this patient's chart.
                        </p>
                      )}
                    </section>
                  );
                })}
                {!rule.citations.length && (
                  <section className="cw-ev-sec">
                    <p>No chart citation supplied.</p>
                  </section>
                )}
              </div>
            )}
            <details className="disclosure">
              <summary>Patient chart · {patient.chart.length} records</summary>
              <div className="disclosure-body">
                {patient.chart.map((line) => (
                  <article className="integration-chart-line" key={line.id}>
                    <strong>{recordTitle(line.source, line.id)}</strong>
                    <p className="cw-sub">
                      Observed {formatDate(line.observedAt)} · Revision{" "}
                      {line.revision}
                    </p>
                    <p>{line.text}</p>
                    <code className="integration-line-id">{line.id}</code>
                  </article>
                ))}
              </div>
            </details>
          </section>
        </div>
      )}
    </div>
  );
}
