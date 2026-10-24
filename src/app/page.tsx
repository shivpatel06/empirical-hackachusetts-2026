import { getServerEnv } from "@/server/env";

// Read the environment at request time, not at build time.
export const dynamic = "force-dynamic";

export default function HomePage() {
  const env = getServerEnv();
  return (
    <main style={{ padding: "24px 16px", maxWidth: 720 }}>
      <h1 style={{ marginTop: 0 }}>Trial Prescreening Agent</h1>
      <p>
        Trial-first prescreening for oncology research coordinators. A likely match is a potential
        prescreening candidate, not a confirmation of eligibility.
      </p>
      <dl>
        <dt style={{ fontWeight: 600 }}>Mode</dt>
        <dd>{env.DEMO_MODE ? "Demo mode (synthetic records, simulated sends only)" : "Demo mode off"}</dd>
        <dt style={{ fontWeight: 600 }}>AI adapter</dt>
        <dd>Not connected yet</dd>
      </dl>
    </main>
  );
}
