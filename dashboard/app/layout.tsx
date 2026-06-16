import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentOS — Conditional Payment Escrow Dashboard",
  description: "Real-time dashboard for autonomous AI agent commerce on Avalanche. Monitor CPE tasks, escrow status, and ERC-8004 reputation.",
  keywords: "AgentOS, CPE, Avalanche, x402, ERC-8004, AI agents, escrow, blockchain",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
