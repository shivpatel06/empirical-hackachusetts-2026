"use client";
import { useEffect, useState } from "react";
import type { CheckedRule, PatientView, WorkflowView } from "../lib/workflow";
import type { ChecklistDraft } from "../lib/schemas/ai";

import { CriterionExpression } from "./criterion-expression";

type Tab = "Trials" | "Worklist" | "Archive" | "Activity";
const labels = {
  likely_match: "Potential match",
  needs_info: "Missing information",
  needs_review: "Needs review",
  ruled_out: "Ruled out",
};
const ruleNames: Record<string, string> = {
  nsclc_met: "NSCLC & MET amplification",
  cns_stable: "CNS disease stability",
  no_met_tki: "Prior MET therapy",
  ici_washout: "Immunotherapy washout",
  anc: "Absolute neutrophil count",
  ast_alt: "AST / ALT",
  hiv: "HIV",
  hbv: "Hepatitis B",
  hcv: "Hepatitis C",
  ctdna: "Circulating tumor DNA",
  banking: "Specimen banking",
  prior_systemic: "Prior systemic therapy",
  zubrod: "Performance status",
};
const shortRule = (id: string) =>
  ruleNames[id] ??
  id.replaceAll("_", " ").replace(/^./, (s) => s.toUpperCase());
const patientName = (id: string) => `Patient ${id.split("-").at(-1)}`;
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Not scheduled";
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    Trials: "M6 3h12v18H6zM9 7h6M9 11h6M9 15h4",
    Worklist: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    Archive: "M4 8h16v12H4zM3 4h18v4H3zM9 12h6",
    Activity: "M3 12h4l3-8 4 16 3-8h4",
    Arrow: "M5 12h14M13 6l6 6-6 6",
    Check: "M5 12l4 4L19 6",
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.Trials} />
    </svg>
  );
}
function Badge({
  status,
  stale = false,
}: {
  status: keyof typeof labels;
  stale?: boolean;
}) {
  return (
    <span className={`badge ${stale ? "stale" : status}`}>
      <i />
      {stale ? "Outdated result" : labels[status]}
    </span>
  );
}
export function Workspace({
  initial,
  initialTab,
  worklistHref,
}: {
  initial: WorkflowView;
  initialTab?: Tab;
  worklistHref?: string;
}) {
  const [view, setView] = useState(initial),
    [tab, setTab] = useState<Tab>(
      initialTab ??
        (initial.checklist?.state === "approved" ? "Worklist" : "Trials"),
    );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null),
    [filter, setFilter] = useState("all");
  const [localOpen, setLocalOpen] = useState(initial.trial?.localOpen ?? false),
    [edit, setEdit] = useState<ChecklistDraft | null>(null),
    [attention, setAttention] = useState(true);
  const [nctId, setNctId] = useState("");
  const [importMode, setImportMode] = useState<"live" | "fixture">("live");
  useEffect(() => {
    setEdit(null);
    setLocalOpen(view.trial?.localOpen ?? false);
    setSelected(null);
    setFilter("all");
  }, [view.trial?.id, view.checklist?.id]);
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await fetch("/api/workflow", { cache: "no-store" });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (!stopped) setView(data);
      } catch {
        if (!stopped)
          setError(
            "Connection interrupted. Your saved work is retained; reconnecting…",
          );
      }
      if (!stopped) timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  async function act(body: object, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setView(data);
      setNotice(message);
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Please try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const current = view.patients.filter(
    (p) => p.screening && !p.screening.stale,
  );
  const count = (status: keyof typeof labels) =>
    current.filter((p) => p.screening!.result.status === status).length;
  const c = view.checklist,
    trial = view.trial;
  const cohort = view.patients.filter((p) =>
    tab === "Archive"
      ? p.screening?.result.status === "ruled_out" && !p.screening.stale
      : p.screening?.result.status !== "ruled_out" || p.screening.stale,
  );
  const visible = cohort.filter(
    (p) => filter === "all" || p.screening?.result.status === filter,
  );
  const patient = visible.find((p) => p.id === selected) ?? null;
  const failed = view.patients.some((p) => p.job?.state === "failed");
  const switchTab = (value: Tab) => {
    if (value === "Worklist" && worklistHref) {
      window.location.assign(worklistHref);
      return;
    }
    setTab(value);
    setSelected(null);
    setFilter("all");
    setNotice("");
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Trial Prescreening home">
          <span className="brand-mark">
            t<span>•</span>
          </span>
          <span>
            Trial<span className="brand-sub">prescreening</span>
          </span>
        </a>
        <div className="workspace-label">COORDINATOR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {(["Trials", "Worklist", "Archive", "Activity"] as Tab[]).map(
            (item) => (
              <button
                key={item}
                className={tab === item ? "nav-item active" : "nav-item"}
                aria-current={tab === item ? "page" : undefined}
                onClick={() => switchTab(item)}
              >
                <Icon name={item} />
                {item}
                {item === "Worklist" && (
                  <span className="nav-count">
                    {view.patients.length - count("ruled_out")}
                  </span>
                )}
              </button>
            ),
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">DC</div>
          <div>
            Demo coordinator<small>Oncology research</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <div className="demo-bar">
          <span>
            <span className="demo-dot" />
            Synthetic demo data · Not for clinical use
          </span>
          <span>
            {view.mode === "fixture"
              ? "Fixture simulation · No AI calls"
              : "Live AI · Synthetic records"}
          </span>
        </div>
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> {tab}
          </div>
          <div className="assessment">
            Assessment date{" "}
            <strong>
              {date(view.assessmentAt)},{" "}
              {new Date(view.assessmentAt).getUTCFullYear()}
            </strong>
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">ONCOLOGY RESEARCH</span>
              <h1>
                {tab === "Trials"
                  ? "A clear starting point."
                  : tab === "Worklist"
                    ? "Your patient worklist."
                    : tab === "Archive"
                      ? "Screened out, with a reason."
                      : "Every step, accounted for."}
              </h1>
              <p>
                {tab === "Trials"
                  ? "Review the trial criteria, then screen your synthetic cohort."
                  : tab === "Worklist"
                    ? "Follow the evidence. Focus on the patients who need your attention."
                    : tab === "Archive"
                      ? "Inspect the evidence behind each exclusion."
                      : "Approvals and screening decisions, saved as they happen."}
              </p>
            </div>
            {tab === "Worklist" && c?.state === "approved" && (
              <button
                className="button secondary"
                disabled={busy || view.pending > 0}
                onClick={() =>
                  act(
                    { action: "screen" },
                    "Current inputs checked. Existing jobs are not duplicated.",
                  )
                }
              >
                <Icon name="Activity" />
                {view.pending ? "Screening…" : "Check cohort"}
              </button>
            )}
          </div>
          {error && (
            <div className="feedback error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {notice && (
            <div className="feedback" role="status">
              {notice}
            </div>
          )}
          {view.pending > 0 && (
            <div className="progress-note" role="status">
              <span className="spinner" />
              Screening {view.pending} remaining record
              {view.pending === 1 ? "" : "s"} against approved criteria. Results
              appear as they finish.
            </div>
          )}
          {failed && (
            <div className="feedback error">
              Some screening jobs failed. Open a patient for the reason.
              <button
                className="text-button"
                disabled={busy || view.pending > 0}
                onClick={() =>
                  act(
                    { action: "retry" },
                    "Eligible failed jobs queued for one retry. Jobs at the two-attempt limit remain failed.",
                  )
                }
              >
                Retry failed jobs
              </button>
            </div>
          )}
          <div className="trial-switcher">
            <label htmlFor="active-trial">Active trial</label>
            <select
              id="active-trial"
              disabled={busy || !!edit}
              value={trial?.id ?? ""}
              onChange={(e) =>
                act(
                  { action: "select", trialId: e.target.value },
                  "Trial workspace opened.",
                )
              }
            >
              {view.trials.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} · {t.title}
                </option>
              ))}
            </select>
          </div>
          {tab === "Trials" && (
            <form
              className="import-panel"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await act(
                    { action: "import", nctId, mode: importMode },
                    "Registry checked. New or changed criteria are ready for review; unchanged content keeps its existing checklist.",
                  )
                )
                  setNctId("");
              }}
            >
              <div>
                <h2>Import a trial</h2>
                <p>
                  Enter a ClinicalTrials.gov ID. New or changed criteria become
                  a draft for your review.
                </p>
              </div>
              <div className="import-fields">
                <label>
                  NCT ID
                  <input
                    value={nctId}
                    onChange={(e) => setNctId(e.target.value)}
                    placeholder="NCT06116682"
                    maxLength={40}
                    required
                    disabled={busy}
                  />
                </label>
                <label>
                  Extraction mode
                  <select
                    value={importMode}
                    onChange={(e) =>
                      setImportMode(e.target.value as "live" | "fixture")
                    }
                    disabled={busy}
                  >
                    <option value="live">Live AI extraction</option>
                    <option value="fixture">Fixture replay</option>
                  </select>
                </label>
                <button
                  className="button"
                  disabled={busy || !!edit}
                  type="submit"
                >
                  {busy ? "Working…" : "Import & review"}
                </button>
              </div>
              <small>
                Live extraction uses the server’s OpenAI connection. Fixture
                replay supports only the original demo snapshot. Import never
                approves criteria or confirms local availability.
              </small>
            </form>
          )}
          {tab === "Trials" && trial && c && (
            <>
              <section className="trial-card">
                <div className="trial-main">
                  <div className="trial-tags">
                    <span className="mono">{trial.id}</span>
                    <span className="registry-status">
                      Registry: {trial.recruitingStatus.toLowerCase()}
                    </span>
                  </div>
                  <h2>
                    {trial.id === "NCT06116682"
                      ? "S1900J · Lung-MAP"
                      : trial.id}
                  </h2>
                  <p className="trial-description">{trial.title}</p>
                  <a
                    className="source-link"
                    href={trial.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View ClinicalTrials.gov record ↗
                  </a>
                </div>
                <div className="trial-facts">
                  <div>
                    <span>DISEASE FOCUS</span>
                    <strong>
                      {trial.conditions.join(", ") || "Not specified"}
                    </strong>
                    <small>
                      {trial.phases.join(" · ").replaceAll("PHASE", "Phase ") ||
                        "Phase not applicable"}
                    </small>
                  </div>
                  <div>
                    <span>SNAPSHOT RETRIEVED</span>
                    <strong>
                      {date(trial.fetchedAt)},{" "}
                      {new Date(trial.fetchedAt).getUTCFullYear()}
                    </strong>
                    <small>
                      Registry updated {trial.updatedAt ?? "Not reported"}
                    </small>
                    <small>Local availability requires confirmation</small>
                  </div>
                </div>
              </section>
              <div className="review-layout">
                <section className="criteria-panel">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">01 / REVIEW</span>
                      <h2>
                        Eligibility checklist{" "}
                        <span className="muted-count">{c.rules.length}</span>
                      </h2>
                    </div>
                    <span className={`version-tag ${c.state}`}>
                      v{c.version} · {c.state}
                    </span>
                  </div>
                  <p className="section-note">
                    Full source paragraphs are retained. This demo checklist
                    still needs clinical and atomic AND/OR review before real
                    use.
                  </p>
                  <div className="criteria-toolbar">
                    <span>
                      {c.rules.filter((r) => r.chartCheckable).length} chart
                      checks · {c.rules.filter((r) => !r.chartCheckable).length}{" "}
                      visit checks
                    </span>
                    {c.state === "draft" ? (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          setEdit(
                            edit ? null : { rules: structuredClone(c.rules) },
                          )
                        }
                      >
                        {edit ? "Cancel editing" : "Edit checklist"}
                      </button>
                    ) : (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await act(
                              { action: "revise", id: c.id },
                              "New draft opened. Previous results are now marked outdated.",
                            )
                          )
                            setEdit(null);
                        }}
                      >
                        Create revision
                      </button>
                    )}
                  </div>
                  {!edit && (
                    <div className="extraction-upgrade">
                      <p>
                        Re-extract the complete registry criteria with Live AI
                        to review individual conditions and alternatives. This
                        creates an unapproved draft and marks earlier results
                        outdated.
                      </p>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          act(
                            {
                              action: "reextract",
                              trialId: trial.id,
                              id: c.id,
                              revision: c.revision,
                            },
                            "A new live-extracted draft is ready. Review all conditions and confirm local availability before approving.",
                          )
                        }
                      >
                        {busy ? "Working…" : "Re-extract criteria with Live AI"}
                      </button>
                    </div>
                  )}
                  {edit && (
                    <div className="edit-note">
                      Edits create a new draft revision. Fixture replay supports
                      the original checklist only; changed rules require live
                      screening and may need manual review.
                      <div className="button-row">
                        <button
                          className="button small"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await act(
                                {
                                  action: "save",
                                  id: c.id,
                                  revision: c.revision,
                                  draft: edit,
                                },
                                "Checklist edits saved. Review before approving.",
                              )
                            )
                              setEdit(null);
                          }}
                        >
                          Save changes
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setEdit(null)}
                        >
                          Discard edits
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="criteria-list">
                    {(edit?.rules ?? c.rules).map((r, index) => (
                      <details key={r.id} className="criterion">
                        <summary>
                          <span className="rule-number">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="criterion-title">
                            {shortRule(r.id)}
                            <small>
                              {r.numeric
                                ? `${r.numeric.operator} ${r.numeric.value} ${r.numeric.unit}`
                                : r.temporal
                                  ? `Evidence within ${r.temporal.maxAgeDays} days`
                                  : r.chartCheckable
                                    ? "Chart evidence required"
                                    : "Verify at visit"}
                            </small>
                          </span>
                          <span className="expand">+</span>
                        </summary>
                        <div className="criterion-body">
                          {edit ? (
                            <>
                              <label className="field-label">
                                Coordinator interpretation
                                <textarea
                                  value={r.qualification}
                                  onChange={(e) =>
                                    setEdit({
                                      ...edit,
                                      rules: edit.rules.map((x) =>
                                        x.id === r.id
                                          ? {
                                              ...x,
                                              qualification: e.target.value,
                                            }
                                          : x,
                                      ),
                                    })
                                  }
                                />
                              </label>
                              <label className="check-field">
                                <input
                                  type="checkbox"
                                  checked={r.chartCheckable}
                                  onChange={(e) =>
                                    setEdit({
                                      ...edit,
                                      rules: edit.rules.map((x) =>
                                        x.id === r.id
                                          ? {
                                              ...x,
                                              chartCheckable: e.target.checked,
                                            }
                                          : x,
                                      ),
                                    })
                                  }
                                />
                                Checkable from the chart
                              </label>
                            </>
                          ) : (
                            <p>{r.qualification}</p>
                          )}
                          <span className="eyebrow">
                            ORIGINAL TRIAL CRITERION
                          </span>
                          <blockquote>{r.sourceQuote}</blockquote>
                          <CriterionExpression
                            rule={r}
                            onChange={
                              edit
                                ? (updated) =>
                                    setEdit({
                                      ...edit,
                                      rules: edit.rules.map((item) =>
                                        item.id === r.id ? updated : item,
                                      ),
                                    })
                                : undefined
                            }
                          />
                          <span className="eyebrow">EVIDENCE TO LOOK FOR</span>
                          <p>{r.evidenceDescription}</p>
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
                <aside className="approval-panel">
                  <span className="eyebrow">02 / SCREEN</span>
                  <h2>
                    {c.state === "approved"
                      ? "Ready for your review."
                      : "From criteria to candidates."}
                  </h2>
                  <p>
                    {c.state === "approved"
                      ? "Open the worklist to inspect patient findings and their source evidence."
                      : "Approve this checklist to screen six synthetic patient records. Every finding keeps its source evidence attached."}
                  </p>
                  <div className="cohort-preview">
                    <div className="cohort-avatars">
                      {[1, 2, 3, 4].map((i) => (
                        <span key={i}>P{i}</span>
                      ))}
                      <span>+2</span>
                    </div>
                    <strong>6 synthetic records</strong>
                    <small>Includes missing, stale and invalid evidence</small>
                  </div>
                  {c.state === "draft" ? (
                    <>
                      <label className="check-field approval-check">
                        <input
                          type="checkbox"
                          checked={localOpen}
                          onChange={(e) => setLocalOpen(e.target.checked)}
                        />
                        <span>
                          I confirm this trial is open at the{" "}
                          <strong>synthetic demo program</strong> and have
                          reviewed the demo criteria.
                        </span>
                      </label>
                      <button
                        className="button primary-full"
                        disabled={busy || !localOpen || !!edit}
                        onClick={async () => {
                          if (
                            await act(
                              {
                                action: "approve",
                                id: c.id,
                                revision: c.revision,
                                localOpen,
                              },
                              "Criteria approved. Screening the synthetic cohort.",
                            )
                          )
                            switchTab("Worklist");
                        }}
                      >
                        Approve & screen cohort <Icon name="Arrow" />
                      </button>
                      <small className="approval-footnote">
                        Registry recruitment alone does not confirm local
                        availability.
                      </small>
                    </>
                  ) : (
                    <>
                      <div className="approval-confirmed">
                        <Icon name="Check" />
                        <span>
                          Approved by {c.approvedBy}
                          <small>
                            {date(c.approvedAt)} · Version {c.version}
                          </small>
                        </span>
                      </div>
                      <button
                        className="button primary-full"
                        onClick={() => switchTab("Worklist")}
                      >
                        Open patient worklist <Icon name="Arrow" />
                      </button>
                    </>
                  )}
                  <div className="scope-note">
                    <span className="eyebrow">WHAT THIS DEMO CHECKS</span>
                    <p>
                      Exact citations, evidence dates, supported numeric
                      thresholds, and hand-authored synthetic assertions.
                      Prescreening is not final eligibility.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}
          {(tab === "Worklist" || tab === "Archive") && (
            <>
              {c?.state !== "approved" && (
                <div className="feedback">
                  {c?.version === 1
                    ? "Review and approve the trial checklist to begin screening."
                    : "A new checklist draft is awaiting approval. Previous findings are outdated."}
                  <button
                    className="text-button"
                    onClick={() => switchTab("Trials")}
                  >
                    Review criteria →
                  </button>
                </div>
              )}
              {tab === "Worklist" && (
                <section
                  className="summary-strip"
                  aria-label="Current screening summary"
                >
                  {(
                    ["likely_match", "needs_info", "needs_review"] as const
                  ).map((status) => (
                    <button
                      key={status}
                      aria-pressed={filter === status}
                      onClick={() =>
                        setFilter(filter === status ? "all" : status)
                      }
                    >
                      <span className={`summary-dot ${status}`} />
                      <strong>{count(status)}</strong>
                      <span>{labels[status]}</span>
                      <span className="summary-arrow">↗</span>
                    </button>
                  ))}
                </section>
              )}
              <div
                className={`worklist-layout ${patient ? "has-selection" : ""}`}
              >
                <section className="patient-panel">
                  <div className="section-heading compact">
                    <div>
                      <h2>
                        {tab === "Archive" ? "Archived records" : "Patients"}{" "}
                        <span className="muted-count">{visible.length}</span>
                      </h2>
                      <p>Ordered by next visit · {trial?.id}</p>
                    </div>
                    {filter !== "all" && (
                      <button
                        className="text-button"
                        onClick={() => setFilter("all")}
                      >
                        Show all
                      </button>
                    )}
                  </div>
                  <div className="table-labels">
                    <span>PATIENT / NEXT VISIT</span>
                    <span>SCREENING FINDING</span>
                  </div>
                  {visible.length === 0 ? (
                    <div className="empty">
                      <Icon name={tab} />
                      <h3>
                        {tab === "Archive"
                          ? "No exclusions to inspect"
                          : "No patients in this view"}
                      </h3>
                      <p>
                        {tab === "Archive"
                          ? "Supported exclusions will appear here after screening."
                          : "Choose another filter to see the rest of the cohort."}
                      </p>
                    </div>
                  ) : (
                    visible.map((p) => (
                      <button
                        className={`patient-row ${patient?.id === p.id ? "selected" : ""}`}
                        key={p.id}
                        onClick={() => {
                          setSelected(p.id);
                          setAttention(true);
                        }}
                        aria-pressed={patient?.id === p.id}
                      >
                        <span className="patient-identity">
                          <span className="patient-avatar">
                            {p.id.split("-").at(-1)}
                          </span>
                          <span>
                            <strong>{patientName(p.id)}</strong>
                            <small>{p.diagnosis}</small>
                            <span className="visit">
                              Next visit · {date(p.nextVisit)}
                            </span>
                          </span>
                        </span>
                        <span className="patient-outcome">
                          {p.screening ? (
                            <>
                              <Badge
                                status={p.screening.result.status}
                                stale={p.screening.stale}
                              />
                              <small>
                                {p.screening.stale
                                  ? "Awaiting current-version screening"
                                  : p.screening.result.prefilter
                                    ? "Disease scope does not match"
                                    : `${p.screening.result.rules.filter((r) => r.status === "met").length} supported · ${p.screening.result.rules.filter((r) => r.status === "unknown").length} unresolved`}
                              </small>
                            </>
                          ) : (
                            <>
                              <span
                                className={`badge ${p.job?.state === "failed" ? "needs_review" : "stale"}`}
                              >
                                <i />
                                {p.job?.state === "failed"
                                  ? "Screening failed"
                                  : p.job?.state === "processing"
                                    ? "Screening…"
                                    : p.job?.state === "queued"
                                      ? "Queued"
                                      : "Not screened"}
                              </span>
                              <small>
                                {p.job?.state === "failed"
                                  ? "Open record for details"
                                  : "Awaiting approved screening"}
                              </small>
                            </>
                          )}
                          <span className="row-arrow">→</span>
                        </span>
                      </button>
                    ))
                  )}
                  <div className="table-footer">
                    Synthetic patient records only{" "}
                    <span>
                      {tab === "Worklist"
                        ? `${count("ruled_out")} ruled out in Archive`
                        : "All exclusions retain their evidence"}
                    </span>
                  </div>
                </section>
                {patient ? (
                  <aside className="evidence-panel">
                    <div className="detail-heading">
                      <div>
                        <span className="eyebrow">EVIDENCE REVIEW</span>
                        <h2>{patientName(patient.id)}</h2>
                      </div>
                      <button
                        className="close-button"
                        aria-label="Close patient details"
                        onClick={() => setSelected(null)}
                      >
                        ×
                      </button>
                    </div>
                    <p className="detail-diagnosis">{patient.diagnosis}</p>
                    <div className="detail-meta">
                      <span>{patient.clinician}</span>
                      <span>Visit {date(patient.nextVisit)}</span>
                    </div>
                    {patient.job?.error && (
                      <div className="feedback error">{patient.job.error}</div>
                    )}
                    {patient.screening ? (
                      <>
                        <Badge
                          status={patient.screening.result.status}
                          stale={patient.screening.stale}
                        />
                        <p className="finding-reason">
                          {patient.screening.result.reason}
                        </p>
                        <div className="detail-policy">
                          {patient.screening.mode === "fixture"
                            ? "Fixture simulation"
                            : "Live AI proposals"}{" "}
                          ·{" "}
                          {patient.screening.result.prefilter ??
                            "Findings checked by deterministic guards."}
                        </div>
                        {patient.screening.result.pendingVisit.length > 0 && (
                          <div className="pending-visit">
                            <strong>
                              {patient.screening.result.pendingVisit.length}{" "}
                              checks remain for the visit
                            </strong>
                            <p>
                              {patient.screening.result.pendingVisit
                                .map(shortRule)
                                .join(" · ")}
                            </p>
                          </div>
                        )}
                        <div className="evidence-toolbar">
                          <h3>Criterion evidence</h3>
                          <button
                            className="text-button"
                            onClick={() => setAttention(!attention)}
                          >
                            {attention ? "Show all" : "Needs attention"}
                          </button>
                        </div>
                        {patient.screening.result.rules.filter(
                          (r) =>
                            !attention ||
                            r.status === "unknown" ||
                            r.status === "not_met",
                        ).length === 0 && attention ? (
                          <div className="no-gaps">
                            <Icon name="Check" />
                            <p>
                              No chart evidence gaps in this result.
                              <button
                                className="text-button"
                                onClick={() => setAttention(false)}
                              >
                                Inspect supporting evidence →
                              </button>
                            </p>
                          </div>
                        ) : (
                          patient.screening.result.rules
                            .filter(
                              (r) =>
                                !attention ||
                                r.status === "unknown" ||
                                r.status === "not_met",
                            )
                            .map((r) => (
                              <Evidence
                                key={r.ruleId}
                                rule={r}
                                patient={patient}
                              />
                            ))
                        )}
                        <p className="result-version">
                          Checklist v
                          {view.checklist?.id === patient.screening.checklistId
                            ? view.checklist.version
                            : "previous"}{" "}
                          · Chart revision {patient.screening.chartRevision} ·{" "}
                          {date(patient.screening.createdAt)}
                        </p>
                      </>
                    ) : (
                      <div className="empty">
                        <h3>No result yet</h3>
                        <p>
                          Once the checklist is approved, screening findings
                          will appear here with their source evidence.
                        </p>
                        <button
                          className="text-button"
                          onClick={() => switchTab("Trials")}
                        >
                          View trial criteria →
                        </button>
                      </div>
                    )}
                  </aside>
                ) : (
                  <aside className="selection-hint">
                    <span className="hint-lines">
                      <i />
                      <i />
                      <i />
                    </span>
                    <h3>The evidence is one click away.</h3>
                    <p>
                      Select a patient to inspect findings, source quotes, and
                      what still needs to be verified.
                    </p>
                  </aside>
                )}
              </div>
            </>
          )}
          {tab === "Activity" && (
            <section className="activity-panel">
              <div className="section-heading">
                <div>
                  <h2>Workspace activity</h2>
                  <p>Most recent first · Persistent, append-only history</p>
                </div>
                <span className="version-tag">
                  {view.activity.length} entries
                </span>
              </div>
              <ol>
                {view.activity.map((item) => (
                  <li key={item.id}>
                    <span className="activity-icon">
                      <Icon
                        name={
                          item.action.includes("approved")
                            ? "Check"
                            : "Activity"
                        }
                      />
                    </span>
                    <div>
                      <strong>{item.action}</strong>
                      <p>{item.detail}</p>
                      <small>
                        {item.actor} ·{" "}
                        {new Date(item.createdAt).toLocaleString("en-US", {
                          timeZone: "UTC",
                        })}{" "}
                        UTC
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <footer className="workspace-footer">
            <span>Trial Prescreening Agent</span>
            <span>Evidence first. Coordinator approved.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Evidence({
  rule,
  patient,
}: {
  rule: CheckedRule;
  patient: PatientView;
}) {
  return (
    <details
      className={`evidence-item ${rule.status}`}
      open={rule.status === "unknown" || rule.status === "not_met"}
    >
      <summary>
        <span className="evidence-indicator">
          {rule.status === "met" ? "✓" : rule.status === "pending" ? "○" : "!"}
        </span>
        <strong>{shortRule(rule.ruleId)}</strong>
        <span className="evidence-status">
          {rule.status === "met"
            ? "Supported"
            : rule.status === "not_met"
              ? "Not met"
              : rule.status === "pending"
                ? "At visit"
                : rule.review
                  ? "Review"
                  : "Missing"}
        </span>
      </summary>
      <div className="evidence-body">
        <p>{rule.reason}</p>
        {rule.conditions && (
          <div className="atomic-findings">
            {rule.conditions.map((condition) => (
              <div key={condition.nodeId} className="atomic-condition">
                <strong>
                  {condition.condition} ·{" "}
                  {condition.status === "met"
                    ? "Supported"
                    : condition.status === "not_met"
                      ? "Not met"
                      : condition.review
                        ? "Review"
                        : "Missing evidence"}
                </strong>
                <p>{condition.reason}</p>
              </div>
            ))}
          </div>
        )}
        {rule.citations.map((citation, index) => {
          const line = patient.chart.find((l) => l.id === citation.lineId);
          return (
            <div
              className={`quote-card ${!rule.provenanceVerified ? "unverified" : ""}`}
              key={`${citation.lineId}-${index}`}
            >
              <span className="eyebrow">
                {rule.provenanceVerified
                  ? "CHART EVIDENCE"
                  : "REJECTED / UNVERIFIED CITATION"}
              </span>
              <blockquote>“{citation.quote}”</blockquote>
              {line ? (
                <>
                  <small>{line.source}</small>
                  <div className="quote-meta">
                    <span>Observed {date(line.observedAt)}</span>
                    <span>
                      {Math.floor(
                        (Date.parse(patient.screening!.result.evaluatedAt) -
                          Date.parse(line.observedAt)) /
                          86400000,
                      )}{" "}
                      days old
                    </span>
                  </div>
                  {line.measurement && (
                    <div className="measurement">
                      {line.measurement.value}{" "}
                      <span>{line.measurement.unit}</span>
                    </div>
                  )}
                </>
              ) : (
                <small>No corresponding line in this patient’s chart.</small>
              )}
              <code>{citation.lineId}</code>
            </div>
          );
        })}
        {!rule.citations.length && <small>No chart citation supplied.</small>}
        {rule.support === "synthetic_assertion" && (
          <small className="support-note">
            Validated against a hand-authored demo assertion. Not clinical
            validation.
          </small>
        )}
      </div>
    </details>
  );
}
