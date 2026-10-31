import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AfterSales AI — Team 41",
  description:
    "Omnichannel AI support and ticket triage for small businesses. PS 2.5 — SPHINX '26.",
};

/**
 * Browser extensions (Bitdefender, Grammarly, LanguageTool, Dark Reader, ColorZilla) write
 * extra attributes onto our elements before React hydrates, and React then reports every touched
 * element as a hydration mismatch — our own markup is identical on both sides.
 *
 * `src/instrumentation-client.ts` arms the guard before `hydrateRoot`, and React renders no extra
 * node for it. `suppressHydrationWarning` on `<html>` and `<body>` covers the markers an extension puts on
 * those two elements and any extension the guard does not know yet.
 *
 * See docs/ARCHITECTURE.md — "Hydration across browser extensions" — and `npm run
 * verify:hydration`, which proves this in a real browser.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
