import type { PatientView, ScreeningStatus } from "../../lib/workflow";

export const statusLabels: Record<ScreeningStatus, string> = {
  likely_match: "Potential match",
  needs_info: "Missing information",
  needs_review: "Needs review",
  ruled_out: "Ruled out",
};
export const patientName = (id: string) => `Patient ${id.split("-").at(-1)}`;
export function currentStatus(patient: PatientView): ScreeningStatus | null {
  return patient.screening && !patient.screening.stale
    ? patient.screening.result.status
    : null;
}
export function patientStatus(patient: PatientView) {
  if (patient.screening?.stale) return "Outdated result";
  const status = currentStatus(patient);
  if (status) return statusLabels[status];
  return patient.job?.state === "failed"
    ? "Screening failed"
    : patient.job?.state === "processing"
      ? "Screening…"
      : patient.job?.state === "queued"
        ? "Queued"
        : "Not screened";
}
export function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/New_York",
      }).format(new Date(value))
    : "Not scheduled";
}
export function visiblePatients(
  patients: PatientView[],
  scope: "all" | "worklist" | "archive",
  query = "",
  filter = "all",
  sort = "visit",
) {
  const q = query.trim().toLowerCase();
  return patients
    .filter((p) => {
      const status = currentStatus(p);
      if (scope === "archive" && status !== "ruled_out") return false;
      if (scope === "worklist" && status === "ruled_out") return false;
      return (
        (filter === "all" || status === filter) &&
        (!q ||
          [patientName(p.id), p.id, p.diagnosis, p.clinician].some((s) =>
            s.toLowerCase().includes(q),
          ))
      );
    })
    .sort((a, b) =>
      sort === "name"
        ? patientName(a.id).localeCompare(patientName(b.id))
        : sort === "status"
          ? patientStatus(a).localeCompare(patientStatus(b))
          : (a.nextVisit ?? "9999").localeCompare(b.nextVisit ?? "9999"),
    );
}
