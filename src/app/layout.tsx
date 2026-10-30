import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AfterSales AI — Team 41",
  description:
    "Omnichannel AI support and ticket triage for small businesses. PS 2.5 — SPHINX '26.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
