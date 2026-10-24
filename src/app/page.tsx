import { EmpiricalWorkspace as Workspace } from "../components/empirical/workspace";
import "../components/empirical/styles/tokens.css";
import "../components/empirical/styles/app.css";
import "../components/empirical/styles/lists.css";
import "../components/empirical/styles/case.css";
import "../components/empirical/styles/integration.css";
import "../components/empirical/styles/journey.css";
import { workflowView } from "../server/workflow/runtime";
export const dynamic = "force-dynamic";
export default function Home() {
  try {
    return <Workspace initial={workflowView()} />;
  } catch {
    return (
      <main className="setup">
        <span className="eyebrow">TRIAL PRESCREENING</span>
        <h1>Prepare your workspace</h1>
        <p>
          The demo database is not ready. Run <code>npm run setup</code> on the
          server, then refresh this page.
        </p>
        <a href="/">Refresh workspace →</a>
      </main>
    );
  }
}
