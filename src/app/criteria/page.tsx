import { Workspace } from "../workspace";
import { workflow } from "../../server/workflow/runtime";
import "../globals.css";
import "../../components/empirical/styles/tokens.css";
import "./review.css";

export const dynamic = "force-dynamic";
export default function CriteriaReview() {
  try {
    return (
      <div className="criteria-review">
        <a className="empirical-return" href="/">
          ← Empirical overview
        </a>
        <Workspace
          initial={workflow().view()}
          initialTab="Trials"
          worklistHref="/?view=worklist"
        />
      </div>
    );
  } catch {
    return (
      <main className="setup">
        <h1>Prepare your workspace</h1>
        <p>
          Run <code>npm run setup</code> on the server, then refresh.
        </p>
        <a href="/criteria">Refresh checklist</a>
      </main>
    );
  }
}
