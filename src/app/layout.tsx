import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "AfterSales AI",
  description:
    "Omnichannel AI support and triage for small businesses — grounded answers, safe escalations.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
