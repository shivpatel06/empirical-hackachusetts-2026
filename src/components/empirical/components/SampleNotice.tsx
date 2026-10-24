import "./sample-notice.css";

export function SampleNotice() {
  return (
    <details className="sample-notice">
      <summary>Sample workspace</summary>
      <p>
        These patients, clinicians and records are fictional. Trial information
        comes from ClinicalTrials.gov. Requests, replies and handoffs stay inside
        this workspace; no messages are delivered. Sample runs use prepared
        responses without AI calls. Live AI runs are labeled separately.
        Prescreening and translations require clinical review.
      </p>
    </details>
  );
}
