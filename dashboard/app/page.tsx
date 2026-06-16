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
  condition: { conditionType: number; fieldName: string; threshold: bigint };
  deadline: bigint;
  status: number;
  outputHash: string;
  resultUri: string;
}

/* ── Pipeline Step Bar ─────────────────────────────────────────────── */
const PipelineBar = ({ currentStatus }: { currentStatus: number }) => {
  const steps = [
    { label: "Create", status: 0 },
    { label: "Lock USDC", status: 0 },
    { label: "Accept", status: 1 },
    { label: "Deliver", status: 1 },
    { label: "Evaluate", status: 2 },
    { label: "Settle", status: 2 },
  ];

  return (
    <div className="pipeline">
      {steps.map((step, i) => {
        const isCompleted = currentStatus > step.status;
        const isActive = currentStatus === step.status;
        const stepClass = isCompleted ? "completed" : isActive ? "active" : "";
        const connectorClass = isCompleted ? "completed" : isActive ? "active" : "";

        return (
          <span key={i} style={{ display: "contents" }}>
            <div className={`pipeline-step ${stepClass}`}>
              <span className="pipeline-step-dot" />
              {step.label}
            </div>
            {i < steps.length - 1 && (
              <div className={`pipeline-connector ${connectorClass}`} />
            )}
          </span>
        );
      })}
    </div>
  );
};

export default function Home() {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [watchTaskId, setWatchTaskId] = useState<bigint | null>(null);
  const [settledTask, setSettledTask] = useState<Task | null>(null);
  const [currentPipelineStatus, setCurrentPipelineStatus] = useState(0);

  const handleConnect = (p: BrowserProvider, addr: string) => {
    setProvider(p);
    setWalletAddress(addr);
  };

  const handleTaskCreated = (taskId: bigint) => {
    setWatchTaskId(taskId);
    setSettledTask(null);
    setCurrentPipelineStatus(0);
  };

  const handleTaskUpdate = useCallback((task: Task) => {
    setCurrentPipelineStatus(task.status);
    if (task.status >= 2) {
      setSettledTask(task);
    }
  }, []);

  return (
    <>
      {/* ── Header Navigation ────────────────────────────────────────── */}
      <header className={`top-nav ${!walletAddress ? "top-nav-on-dark" : ""}`}>
        <a href="#" className="nav-logo">
          <span className="nav-logo-icon" />
          <span className="nav-logo-text">Agent<span>OS</span></span>
        </a>
        <div className="nav-links">
          <span className="nav-link">Cryptocurrencies</span>
          <span className="nav-link">Escrow</span>
          <span className="nav-link">ERC-8004</span>
          <span className="nav-link">Developers</span>
        </div>
        <div>
          <WalletConnect onConnect={handleConnect} />
        </div>
      </header>

      {/* ── Hero (Shown when wallet is not connected) ────────────────── */}
      {!walletAddress && (
        <section className="hero-band-dark">
          <div className="neon-glow-bg">
            <div className="neon-glow-orb neon-orb-1" />
            <div className="neon-glow-orb neon-orb-2" />
            <div className="neon-glow-orb neon-orb-3" />
          </div>
          <div className="hero-container">
            <div className="hero-left">
              <h1 className="display-mega">
                Prove it first.<br />
                Then get paid.
              </h1>
              <p>
                Lock USDC in escrow. Set verifiable condition triggers on-chain.
                Release payments automatically only when the Research Agent delivers
                qualifying output. Gated by ERC-8004 identity registry.
              </p>
              <div className="hero-ctas">
                <WalletConnect onConnect={handleConnect} />
              </div>
            </div>

            <div className="hero-right">
              <div className="mockup-container">
                {/* Main floating card */}
                <div className="product-ui-card-dark mockup-main">
                  <div className="mockup-header">
                    <span className="mockup-title">Escrow Status</span>
                    <span className="status-badge status-pending">
                      <span className="status-dot" />
                      PENDING_PROOF
                    </span>
                  </div>
                  <div className="mockup-row">
                    <span className="mockup-label">Locked Escrow</span>
                    <span className="mockup-value">0.50 USDC</span>
                  </div>
                  <div className="mockup-row">
                    <span className="mockup-label">Trigger Condition</span>
                    <span className="mockup-value">VALUE_THRESHOLD</span>
                  </div>
                  <div className="mockup-row">
                    <span className="mockup-label">Target Field</span>
                    <span className="mockup-value">yield_opportunities</span>
                  </div>
                  <div className="mockup-row">
                    <span className="mockup-label">Threshold</span>
                    <span className="mockup-value">&gt;= 3</span>
                  </div>
                </div>

                {/* Sub overlapping card */}
                <div className="product-ui-card-dark mockup-sub">
                  <div className="mockup-header">
                    <span className="mockup-title">Research Agent</span>
                    <span className="status-badge status-pass">
                      <span className="status-dot" />
                      TRUST: 87/100
                    </span>
                  </div>
                  <div className="mockup-row">
                    <span className="mockup-label">Identity Gating</span>
                    <span className="mockup-value">ERC-8004 Gated</span>
                  </div>
                  <div className="mockup-row">
                    <span className="mockup-label">Capabilities</span>
                    <span className="mockup-value">"research"</span>
                  </div>
                </div>

                {/* Background plate */}
                <div className="mockup-back" />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Dashboard (Shown when wallet is connected) ────────────────── */}
      {walletAddress && (
        <section className="dashboard-section bg-soft">
          <div className="dashboard-container">
            <PipelineBar currentStatus={currentPipelineStatus} />
            <div className="dashboard-grid">
              <ConditionBuilder provider={provider} onTaskCreated={handleTaskCreated} />
              <EscrowStatus watchTaskId={watchTaskId} onTaskUpdate={handleTaskUpdate} />
              <div className="full-width">
                <DeliveryViewer task={settledTask} taskId={watchTaskId} />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="app-footer">
        <div className="footer-inner">
          <span>AgentOS v0.1</span>
          <div className="footer-links">
            <span className="footer-link">Avalanche Fuji Testnet</span>
            <span className="footer-link">x402 Protocol</span>
            <span className="footer-link">ERC-8004 Identity</span>
          </div>
        </div>
      </footer>
    </>
  );
}
