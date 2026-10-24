import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Trial Prescreening Agent (synthetic demo)",
  description: "Trial-first prescreening for oncology research coordinators. Synthetic demo data only.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", color: "#1a1a1a" }}>
        {/* R2.1: every screen carries the synthetic-data label. */}
        <div
          role="note"
          style={{
            background: "#fff4ce",
            borderBottom: "1px solid #c9a400",
            padding: "8px 16px",
            fontWeight: 600,
          }}
        >
          Synthetic demo data — not for clinical use
        </div>
        {children}
      </body>
    </html>
  );
}
