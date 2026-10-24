import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/instrument-serif/latin-400.css";
export const metadata: Metadata = {
  title: "Empirical · Coordinator workspace",
  icons: {
    icon: "/brand/empirical-mark.svg",
    apple: "/brand/empirical-touch-icon-180.png",
  },
  description:
    "Evidence-backed oncology trial prescreening. Synthetic demo only.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
