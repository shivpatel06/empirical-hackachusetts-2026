import { Workspace } from "./workspace";
import { workflow } from "../server/workflow/runtime";
export const dynamic = "force-dynamic";
export default function Home() {
  try {
    return <Workspace initial={workflow().view()} />;
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
