"use client";
/* THESIS: Empirical's supplied coordinator interface, connected to persisted evidence.
 * OWN-WORLD: graphite, sea-glass, floating nav and frosted surfaces; original fonts.
 * STORY: select a trial, review its checklist, then inspect current patient findings.
 * FIRST VIEWPORT: candidates beside a workflow rail; trial selection above both.
 * FORM: user-selected waccabacca/empirical composition, adapted to server contracts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowView, PatientView } from "../../lib/workflow";
import { BrandMark } from "./components/BrandMark";
import { SiteMenu } from "./components/SiteMenu";
import {
  applyTheme,
  readTheme,
  saveTheme,
  type ThemeId,
} from "./state/appearance";
import {
  currentStatus,
  formatDate,
  patientName,
  patientStatus,
  statusLabels,
  visiblePatients,
} from "./presentation";
import { EvidenceWorkspace } from "./evidence";

type Page =
  | "Overview"
  | "Worklist"
  | "Inbox"
  | "Outreach"
  | "Archive"
  | "Activity";
const NAV: Page[] = ["Overview", "Worklist", "Inbox", "Outreach", "Activity"];
export function EmpiricalWorkspace({ initial }: { initial: WorkflowView }) {
  const [view, setView] = useState(initial);
  const [page, setPage] = useState<Page>("Overview");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("visit");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [connectionError, setConnectionError] = useState(""),
    [notice, setNotice] = useState("");
  const [navOpen, setNavOpen] = useState(false),
    [demoOpen, setDemoOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("sea");
  const toggleRef = useRef<HTMLButtonElement>(null),
    mainRef = useRef<HTMLElement>(null),
    dialogRef = useRef<HTMLDialogElement>(null);
  const requestEpoch = useRef(0),
    busyRef = useRef(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "worklist")
      setPage("Worklist");
    const saved = readTheme();
    setTheme(saved);
    applyTheme(saved);
  }, []);
  const changeTheme = (value: ThemeId) => {
    setTheme(value);
    applyTheme(value);
    saveTheme(value);
  };
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      const epoch = requestEpoch.current;
      if (!busyRef.current) {
        try {
          const response = await fetch("/api/workflow", {
            cache: "no-store",
            signal: controller.signal,
          });
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Workspace unavailable");
          if (!stopped && epoch === requestEpoch.current && !busyRef.current) {
            setView(data);
            setConnectionError("");
          }
        } catch {
          if (!stopped)
            setConnectionError(
              "Connection interrupted. Saved records are retained. Reconnecting…",
            );
        }
      }
      if (!stopped) timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 1000);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    setSelected(null);
    setFilter("all");
  }, [view.trial?.id]);
  useEffect(() => {
    mainRef.current
      ?.querySelector<HTMLElement>("h1")
      ?.focus({ preventScroll: true });
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [page, selected]);
  useEffect(() => {
    if (demoOpen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [demoOpen]);
  const closeMenu = useCallback((restore: boolean) => {
    setNavOpen(false);
    if (restore) toggleRef.current?.focus();
  }, []);
  const go = (target: Page) => {
    setPage(target);
    setSelected(null);
    setFilter("all");
    setQuery("");
    closeMenu(false);
    requestAnimationFrame(() =>
      mainRef.current?.querySelector<HTMLElement>("h1")?.focus(),
    );
  };
  async function act(body: object, message: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    requestEpoch.current++;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Action could not be completed.");
      setView(data);
      setConnectionError("");
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      requestEpoch.current++;
      busyRef.current = false;
      setBusy(false);
    }
  }
  const patient = view.patients.find((p) => p.id === selected);
  const approved = view.checklist?.state === "approved";
  const current = view.patients.filter((p) => currentStatus(p));
  const rows = visiblePatients(
    view.patients,
    page === "Archive" ? "archive" : page === "Worklist" ? "worklist" : "all",
    query,
    filter,
    sort,
  );
  const next = visiblePatients(view.patients, "worklist")[0];
  const openCase = (id: string) => {
    setSelected(id);
    setNotice("");
  };
  const selectTrial = (id: string) => {
    closeMenu(true);
    void act({ action: "select", trialId: id }, "Trial opened.");
  };
  return (
    <div className="app empirical-app">
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <header className="topnav-wrap">
        <div className="topnav">
          <button
            className="brand"
            onClick={() => go("Overview")}
            aria-label="Empirical — Overview"
            inert={navOpen}
          >
            <BrandMark />
            <span className="brand-name">Empirical</span>
          </button>
          <nav className="topnav-links" aria-label="Primary" inert={navOpen}>
            <ul>
              {NAV.map((item) => (
                <li key={item}>
                  <button
                    className="tab-link"
                    data-label={item}
                    aria-current={page === item ? "page" : undefined}
                    onClick={() => go(item)}
                  >
                    <span className="tab-link-text">{item}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="topnav-right">
            <button
              className="demo-btn"
              onClick={() => setDemoOpen(true)}
              inert={navOpen}
            >
              Demo
            </button>
            <button
              ref={toggleRef}
              className="menu-toggle"
              aria-label={navOpen ? "Close menu" : "Open menu"}
              aria-expanded={navOpen}
              aria-controls="site-menu"
              onClick={() => (navOpen ? closeMenu(true) : setNavOpen(true))}
            >
              <span className="mt-line" />
              <span className="mt-line" />
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="main" ref={mainRef} inert={navOpen}>
        <div className="integration-context">
          <span>Synthetic patient data · Not for clinical use</span>
          <span>
            {view.mode === "fixture"
              ? "Fixture simulation · No AI calls"
              : "Live AI · Synthetic records"}
          </span>
        </div>
        {(error || connectionError) && (
          <div className="card integration-notice error" role="alert">
            {error || connectionError}
            <button
              className="btn btn--quiet"
              onClick={() => {
                setError("");
                setConnectionError("");
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        {notice && (
          <div className="card integration-notice" role="status">
            {notice}
          </div>
        )}
        {view.pending > 0 && (
          <div className="card integration-notice" role="status">
            <span className="spinner" /> Screening {view.pending} remaining
            records…
          </div>
        )}
        {patient ? (
          <EvidenceWorkspace
            key={`${patient.id}:${patient.screening?.id}`}
            patient={patient}
            view={view}
            onBack={() => setSelected(null)}
          />
        ) : (
          <>
            <header className="page-head page-head--overview">
              <h1 className="page-title" tabIndex={-1}>
                {page}
              </h1>
              <div
                className="tabs trial-tabs"
                role="group"
                aria-label="Select trial"
              >
                {view.trials.map((t) => (
                  <button
                    key={t.id}
                    disabled={busy}
                    aria-pressed={view.trial?.id === t.id}
                    onClick={() => selectTrial(t.id)}
                    title={t.title}
                  >
                    {t.id === "NCT06116682" ? "S1900J · Lung-MAP" : t.id}
                  </button>
                ))}
              </div>
            </header>
            {!approved && (
              <section className="card approve-card">
                <div>
                  <h2>Review the trial checklist</h2>
                  <p>
                    {view.checklist?.rules.length ?? 0} rules await review.{" "}
                    {view.checklist && view.checklist.version > 1
                      ? "Previous results are outdated."
                      : "Screening begins after approval."}
                  </p>
                </div>
                <a className="btn btn--primary" href="/criteria">
                  Review checklist
                </a>
              </section>
            )}
            {(page === "Overview" ||
              page === "Worklist" ||
              page === "Archive") && (
              <>
                <div className={page === "Overview" ? "overview-grid" : ""}>
                  {page === "Overview" && (
                    <aside
                      className="overview-rail"
                      aria-label="Workflow and next step"
                    >
                      <section className="feature">
                        <p className="feature-kicker">Trial prescreening</p>
                        <h2 className="feature-title">
                          Evidence before decisions.
                        </h2>
                        <ol className="feature-steps">
                          <li>
                            <span className="fs-num">1</span>
                            <span>
                              <strong>Criteria</strong>
                              <span>
                                {view.checklist
                                  ? `Version ${view.checklist.version} · ${view.checklist.state}`
                                  : "Import a trial to begin"}
                              </span>
                            </span>
                          </li>
                          <li>
                            <span className="fs-num">2</span>
                            <span>
                              <strong>Evidence</strong>
                              <span>
                                {current.length} current results ·{" "}
                                {view.patients.length} patients
                              </span>
                            </span>
                          </li>
                          <li className="fs-human">
                            <span className="fs-num">3</span>
                            <span>
                              <strong>Review</strong>
                              <span>Source, dates and unresolved checks</span>
                            </span>
                          </li>
                        </ol>
                        <a
                          className="btn btn--primary feature-btn"
                          href="/criteria"
                        >
                          {approved
                            ? "Inspect trial criteria"
                            : "Review checklist"}{" "}
                          <span aria-hidden="true">→</span>
                        </a>
                      </section>
                      {next && (
                        <button
                          className="next-card card"
                          onClick={() => openCase(next.id)}
                        >
                          <span className="next-label">Next visit</span>
                          <span className="next-main">
                            <strong>{patientName(next.id)}</strong> ·{" "}
                            {formatDate(next.nextVisit)}
                          </span>
                          <span aria-hidden="true">→</span>
                        </button>
                      )}
                    </aside>
                  )}
                  <section
                    className="cand-section"
                    aria-label="Patient candidates"
                  >
                    <div className="section-row">
                      <h2 className="section-header">
                        {page === "Archive"
                          ? "Archived exclusions"
                          : "Candidates"}
                      </h2>
                      <span className="eyebrow">
                        {rows.length} records
                        {page !== "Archive" &&
                          ` · ${current.filter((p) => currentStatus(p) === "likely_match").length} potential ${current.filter((p) => currentStatus(p) === "likely_match").length === 1 ? "match" : "matches"}`}
                      </span>
                    </div>
                    <div className="cand-controls">
                      <div
                        className="tabs tabs--filters"
                        role="group"
                        aria-label="Status filter"
                      >
                        <button
                          aria-pressed={filter === "all"}
                          onClick={() => setFilter("all")}
                        >
                          All
                        </button>
                        {Object.entries(statusLabels)
                          .filter(([key]) =>
                            page === "Archive"
                              ? key === "ruled_out"
                              : page === "Worklist"
                                ? key !== "ruled_out"
                                : true,
                          )
                          .map(([key, label]) => (
                            <button
                              key={key}
                              aria-pressed={filter === key}
                              onClick={() => setFilter(key)}
                            >
                              {label}
                            </button>
                          ))}
                      </div>
                      <div className="cand-tools">
                        <label className="sr-only" htmlFor="patient-search">
                          Search candidates
                        </label>
                        <input
                          className="input"
                          id="patient-search"
                          type="search"
                          placeholder="Search patients"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                        <label className="sr-only" htmlFor="patient-sort">
                          Sort candidates
                        </label>
                        <select
                          className="select"
                          id="patient-sort"
                          value={sort}
                          onChange={(e) => setSort(e.target.value)}
                        >
                          <option value="visit">Next visit</option>
                          <option value="name">Name</option>
                          <option value="status">Status</option>
                        </select>
                      </div>
                    </div>
                    {rows.length ? (
                      <ul className="list cand-list">
                        {rows.map((p, i) => (
                          <Candidate
                            key={p.id}
                            patient={p}
                            index={i}
                            onOpen={() => openCase(p.id)}
                          />
                        ))}
                      </ul>
                    ) : (
                      <div className="card empty">
                        <h3>No patients in this view</h3>
                        <p>Change your filter or review the trial checklist.</p>
                        {(query || filter !== "all") && (
                          <button
                            className="btn"
                            onClick={() => {
                              setQuery("");
                              setFilter("all");
                            }}
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    )}
                    <div className="integration-actions">
                      <button
                        className="btn btn--quiet"
                        onClick={() =>
                          go(page === "Archive" ? "Worklist" : "Archive")
                        }
                      >
                        {page === "Archive"
                          ? "Back to worklist"
                          : "View exclusion archive"}{" "}
                        →
                      </button>
                      <button
                        className="btn"
                        disabled={
                          busy ||
                          view.pending > 0 ||
                          !approved ||
                          !view.demoMode
                        }
                        onClick={() =>
                          act(
                            { action: "screen" },
                            "Current inputs checked. Existing screening jobs are not duplicated.",
                          )
                        }
                      >
                        {busy || view.pending ? "Working…" : "Check cohort"}
                      </button>
                    </div>
                    {view.patients.some((p) => p.job?.state === "failed") && (
                      <button
                        className="btn"
                        disabled={busy || view.pending > 0}
                        onClick={() =>
                          act(
                            { action: "retry" },
                            "Eligible failed jobs queued for retry.",
                          )
                        }
                      >
                        Retry failed screening jobs
                      </button>
                    )}
                  </section>
                </div>
                <div className="more-sections">
                  <details className="disclosure">
                    <summary>
                      Protocol and checklist{" "}
                      <span className="cell-sub">
                        {view.trial?.id} · v{view.checklist?.version}
                      </span>
                    </summary>
                    <div className="disclosure-body">
                      <h2>{view.trial?.title ?? "No trial selected"}</h2>
                      <p>{view.trial?.conditions.join(" · ")}</p>
                      <p>
                        Registry: {view.trial?.recruitingStatus} · Local
                        availability:{" "}
                        {view.trial?.localOpen
                          ? "confirmed for synthetic demo"
                          : "awaiting confirmation"}
                      </p>
                      <p>
                        Checklist:{" "}
                        {view.checklist?.mode === "live"
                          ? "Live AI extraction"
                          : "Fixture simulation"}{" "}
                        · Assessment {formatDate(view.assessmentAt)}
                      </p>
                      <div className="integration-actions">
                        <a className="btn" href="/criteria">
                          Review and edit checklist
                        </a>
                        {view.trial && (
                          <a
                            className="btn btn--quiet"
                            href={view.trial.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            ClinicalTrials.gov ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </details>
                  <details className="disclosure">
                    <summary>Recent activity</summary>
                    <div className="disclosure-body">
                      <Activity view={view} compact />
                      <button
                        className="btn btn--quiet"
                        onClick={() => go("Activity")}
                      >
                        View all activity →
                      </button>
                    </div>
                  </details>
                </div>
              </>
            )}
            {page === "Activity" && <Activity view={view} />}
            {page === "Inbox" && (
              <section className="card integration-empty">
                <h2>Coordinator approvals</h2>
                <p>
                  {approved
                    ? "The trial checklist is approved. Record-request and match-review inbox actions are not connected yet."
                    : "Your trial checklist is ready for review. Record-request and match-review inbox actions are not connected yet."}
                </p>
                <a className="btn btn--primary" href="/criteria">
                  Review trial checklist
                </a>
              </section>
            )}
            {page === "Outreach" && (
              <section className="card integration-empty">
                <h2>Outreach is not connected yet</h2>
                <p>
                  Doctor notes, contact approval and messaging are still
                  prototype features. This workspace does not send messages.
                </p>
                <button className="btn" onClick={() => go("Worklist")}>
                  Open patient worklist
                </button>
              </section>
            )}
          </>
        )}
        <footer className="integration-footer">
          <span>Empirical · Oncology research</span>
          <span>Prescreening supports review, not final eligibility.</span>
        </footer>
      </main>
      <SiteMenu
        open={navOpen}
        toggleRef={toggleRef}
        items={[...NAV, "Archive" as Page].map((item) => ({
          id: item,
          label: item,
          current: item === page,
        }))}
        trials={view.trials.map((t) => ({
          id: t.id,
          label: t.id,
          current: t.id === view.trial?.id,
          detail: t.title,
        }))}
        footer="Synthetic patient data. No messages are sent."
        onNavigate={(id) => go(id as Page)}
        onSelectTrial={selectTrial}
        theme={theme}
        onTheme={changeTheme}
        onClose={closeMenu}
      />
      <dialog
        ref={dialogRef}
        className="integration-dialog"
        onCancel={() => setDemoOpen(false)}
        onClose={() => setDemoOpen(false)}
      >
        <h2>About this demo</h2>
        <p>
          Synthetic patients and a public trial registry snapshot. Changes to
          trial criteria and screening are saved on the server.
        </p>
        <p>
          {view.mode === "fixture"
            ? "Fixture simulation is active. Screening uses deterministic sample proposals; no AI calls are made by screening."
            : "Live AI is active. Model proposals are checked by deterministic evidence guards."}
        </p>
        <p>
          Full clinical validation, record-request approvals and outreach remain
          unfinished. Nothing is sent to a patient or clinician.
        </p>
        <button className="btn btn--primary" onClick={() => setDemoOpen(false)}>
          Close
        </button>
      </dialog>
    </div>
  );
}
function Candidate({
  patient: p,
  index,
  onOpen,
}: {
  patient: PatientView;
  index: number;
  onOpen(): void;
}) {
  const status = currentStatus(p);
  return (
    <li style={{ ["--i" as string]: index }}>
      <button className="list-row list-row--button cand-row" onClick={onOpen}>
        <span className="avatar" aria-hidden="true">
          {p.id.split("-").at(-1)}
        </span>
        <span className="list-row-main">
          <span className="cand-name">{patientName(p.id)}</span>
          <span className="cand-sub">{p.diagnosis}</span>
          <span className="cand-sub">Visit {formatDate(p.nextVisit)}</span>
        </span>
        <span className="cand-trail">
          <span
            className={`status ${status === "likely_match" ? "status--ok" : "status--info"}`}
          >
            <span className="status-dot" />
            {patientStatus(p)}
          </span>
          <span className="cand-checks">
            {p.screening && !p.screening.stale
              ? `${p.screening.result.rules.filter((r) => r.status === "met").length} supported · ${p.screening.result.rules.filter((r) => r.status === "unknown").length} unresolved`
              : p.screening?.stale
                ? "Awaiting current-version screening"
                : "Review checklist to begin"}
          </span>
        </span>
        <span className="list-chevron" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  );
}
function Activity({
  view,
  compact = false,
}: {
  view: WorkflowView;
  compact?: boolean;
}) {
  const activity = compact ? view.activity.slice(0, 5) : view.activity;
  return activity.length ? (
    <ol className="list ls-timeline">
      {activity.map((item) => (
        <li className="ls-event" key={item.id}>
          <span className="ls-time">
            {formatDate(item.createdAt)}
            <span>
              {new Date(item.createdAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: "America/New_York",
              })}{" "}
              ET
            </span>
          </span>
          <span
            className={`ls-dot ls-dot--${item.actor === "coordinator" ? "human" : "auto"}`}
          />
          <div className="ls-event-text">
            <p className="ls-event-summary">
              {item.action.replaceAll("_", " ")}
            </p>
            <p className="ls-event-meta">{item.detail}</p>
            <p className="ls-event-meta">{item.actor}</p>
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <div className="card empty">
      <h3>No activity yet</h3>
      <p>Saved approvals and screening events will appear here.</p>
    </div>
  );
}
