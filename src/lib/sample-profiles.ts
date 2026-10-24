/** Fictional presentation identities. Stable patient IDs and chart evidence stay unchanged. */
const profiles: Record<string, { name: string; clinician: string }> = {
  "synthetic-01": { name: "Marcus Bell", clinician: "Dr. Maya Shah" },
  "synthetic-02": { name: "Walter Hughes", clinician: "Dr. Owen Brooks" },
  "synthetic-03": { name: "Elena Rivera", clinician: "Dr. Maya Shah" },
  "synthetic-04": { name: "Daniel Kim", clinician: "Dr. Nina Patel" },
  "synthetic-05": { name: "Grace Okafor", clinician: "Dr. Owen Brooks" },
  "synthetic-06": { name: "Robert Chen", clinician: "Dr. Nina Patel" },
};

export const patientName = (id: string) =>
  profiles[id.replace(/^lumen-/, "synthetic-")]?.name ?? `Patient ${id.split("-").at(-1)}`;
export const clinicianName = (id: string, original: string) =>
  original === "Demo oncology team" ? profiles[id.replace(/^lumen-/, "synthetic-")]?.clinician ?? original : original;

const documents: Record<string, string> = {
  assignment: "Research enrollment worksheet",
  nsclc_met: "Pathology & molecular profiling",
  measurable: "CT chest · Tumor assessment",
  brain_imaging: "Radiology · Brain MRI",
  cns_stable: "Neurology assessment",
  other_drivers: "Molecular pathology report",
  progression: "Oncology progress note",
  prior_systemic: "Treatment history",
  recovered: "Treatment follow-up note",
  no_met_tki: "Medication reconciliation",
  systemic_washout: "Systemic treatment administration",
  ici_washout: "Immunotherapy administration",
  radiation_washout: "Radiation treatment summary",
  no_concurrent: "Current treatment plan",
  surgery: "Surgical history",
  other_malignancy: "Oncology history",
  anc: "Hematology · CBC with differential",
  hemoglobin: "Hematology · Hemoglobin",
  platelets: "Hematology · Platelet count",
  bilirubin: "Chemistry · Bilirubin",
  ast_alt: "Chemistry · Liver function",
  renal: "Chemistry · Renal function",
  zubrod: "Performance status assessment",
  exam: "Physical examination",
  cardiac: "Cardiology assessment",
  hiv: "Infectious disease history · HIV",
  hbv: "Hepatitis B screening",
  hcv: "Hepatitis C screening",
  diabetes: "Medical history · Diabetes",
  pregnancy_test: "Laboratory · Pregnancy screening",
  liver_infection: "Medical history · Liver disease",
  hypertension: "Vitals & blood pressure review",
  pneumonitis: "Pulmonary assessment",
  infection: "Infection review",
  bleeding: "Bleeding risk assessment",
  oxygenation: "Vitals · Oxygen saturation",
  compliance: "Care-team assessment",
  ophthalmology: "Ophthalmology assessment",
  pregnancy_contraception: "Reproductive health review",
};
/** A readable title, never a replacement for the original source or quoted chart text. */
export function recordTitle(source: string, lineId: string) {
  const match = /^Hand-authored synthetic ([a-z_]+) record$/.exec(source);
  if (match) return documents[match[1]!] ?? source;
  if (source === "Simulated outside-record reply · authored demo fixture") {
    if (lineId.endsWith("brain_imaging")) return "Outside records · Brain MRI report";
    if (lineId.endsWith("hemoglobin")) return "Outside records · Hemoglobin result";
  }
  return source;
}
