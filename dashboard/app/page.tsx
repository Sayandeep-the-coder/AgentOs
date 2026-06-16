"use client";

import { useState, useCallback } from "react";
import { BrowserProvider } from "ethers";
import WalletConnect from "./components/WalletConnect";
import ConditionBuilder from "./components/ConditionBuilder";
import EscrowStatus from "./components/EscrowStatus";
import DeliveryViewer from "./components/DeliveryViewer";

interface Task {
  payer: string;
  payee: string;
  amount: bigint;
  conditionHash: string;
  condition: { conditionType: number; fieldName: string; threshold: bigint };
  deadline: bigint;
  status: number;
  outputHash: string;
  resultUri: string;
}

export default function Home() {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [watchTaskId, setWatchTaskId] = useState<bigint | null>(null);
  const [settledTask, setSettledTask] = useState<Task | null>(null);

  const handleConnect = (p: BrowserProvider, addr: string) => {
    setProvider(p);
    setWalletAddress(addr);
  };

  const handleTaskCreated = (taskId: bigint) => {
    setWatchTaskId(taskId);
    setSettledTask(null);
  };

  const handleTaskUpdate = useCallback((task: Task) => {
    if (task.status >= 2) {
      setSettledTask(task);
    }
  }, []);

  return (
    <>
      {/* ── Background glow effect ──────────────────────────────────── */}
      <div style={{
        position: "fixed", inset: 0, zIndex: -1,
        background: `
          radial-gradient(800px circle at 20% 20%, rgba(232, 65, 66, 0.04), transparent 50%),
          radial-gradient(600px circle at 80% 80%, rgba(99, 102, 241, 0.04), transparent 50%),
          var(--color-bg-primary)
        `,
      }} />

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-icon">A</div>
            <div>
              <div className="logo-text">AgentOS</div>
              <div className="logo-subtitle">Conditional Payment Escrow</div>
            </div>
          </div>
          <WalletConnect onConnect={handleConnect} />
        </div>
      </header>

      {/* ── Hero Banner ─────────────────────────────────────────────── */}
      {!walletAddress && (
        <div style={{
          maxWidth: "1400px", margin: "0 auto", padding: "60px 24px",
          textAlign: "center",
        }}>
          <h1 style={{
            fontSize: "42px", fontWeight: 800, lineHeight: 1.2,
            background: "var(--gradient-hero)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text", marginBottom: "16px",
          }}>
            Prove It First — Then Get Paid
          </h1>
          <p style={{
            fontSize: "18px", color: "var(--color-text-secondary)",
            maxWidth: "600px", margin: "0 auto 32px",
          }}>
            Lock USDC in escrow. Set verifiable conditions. Release payment only when the Research Agent delivers qualifying output. No human approvals.
          </p>
          <div style={{
            display: "flex", justifyContent: "center", gap: "24px",
            flexWrap: "wrap",
          }}>
            {[
              { icon: "🔒", label: "Escrow Lock", desc: "USDC locked on task creation" },
              { icon: "⚡", label: "On-Chain Eval", desc: "Conditions verified in Solidity" },
              { icon: "🔄", label: "Auto-Settle", desc: "Pass → pay, Fail → refund" },
              { icon: "📊", label: "ERC-8004", desc: "Reputation from outcomes" },
            ].map((item, i) => (
              <div key={i} className="glass-card" style={{
                padding: "24px", width: "200px", textAlign: "center",
                animationDelay: `${i * 0.1}s`,
              }}>
                <div style={{ fontSize: "28px", marginBottom: "8px" }}>{item.icon}</div>
                <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px" }}>{item.label}</div>
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dashboard Grid ──────────────────────────────────────────── */}
      {walletAddress && (
        <div className="dashboard-grid">
          <ConditionBuilder provider={provider} onTaskCreated={handleTaskCreated} />
          <EscrowStatus watchTaskId={watchTaskId} onTaskUpdate={handleTaskUpdate} />
          <DeliveryViewer task={settledTask} taskId={watchTaskId} />
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer style={{
        textAlign: "center", padding: "32px 24px",
        color: "var(--color-text-muted)", fontSize: "12px",
        borderTop: "1px solid var(--color-border)",
        marginTop: "48px",
      }}>
        <p>
          AgentOS — Team1 India Speedrun · JUNE 2026 Hackathon · Theme: Agentic Payments
        </p>
        <p style={{ marginTop: "4px" }}>
          Avalanche Fuji C-Chain · x402 + ERC-8004 · Solidity 0.8.20
        </p>
      </footer>
    </>
  );
}
