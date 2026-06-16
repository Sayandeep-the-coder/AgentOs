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

  // ── Simulator State Machine for Interactive Playground ──────────
  const [simState, setSimState] = useState<"IDLE" | "LOCKING" | "SUBMITTING" | "EVALUATING" | "SETTLED_PASS" | "SETTLED_FAIL">("IDLE");
  const [simActivePath, setSimActivePath] = useState<"A" | "B" | null>(null);
  const [simTrustScore, setSimTrustScore] = useState(87);

  const runSimulation = (path: "A" | "B") => {
    setSimActivePath(path);
    setSimState("LOCKING");
    setSimTrustScore(path === "A" ? 87 : 42);

    // Timeline transitions simulating CPE Contract state triggers
    setTimeout(() => {
      setSimState("SUBMITTING");
    }, 1200);

    setTimeout(() => {
      setSimState("EVALUATING");
    }, 2400);

    setTimeout(() => {
      if (path === "A") {
        setSimState("SETTLED_PASS");
        setSimTrustScore(88);
      } else {
        setSimState("SETTLED_FAIL");
        setSimTrustScore(41);
      }
    }, 3800);
  };

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

      {/* ── Landing Page (Shown when wallet is not connected) ────────── */}
      {!walletAddress && (
        <>
          {/* Hero Band */}
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

          {/* Section 1: Features (White Canvas) */}
          <section className="landing-section-white">
            <div className="landing-section-header">
              <h2>Trust built directly on-chain</h2>
              <p>Solve execution and delivery validation without manual checkpoints.</p>
            </div>
            <div className="benefit-grid">
              <div className="benefit-card">
                <span className="badge-pill">Escrow Lock</span>
                <h3>Secure Escrow</h3>
                <p>USDC is locked in the Conditional Payment Escrow contract. Capital is committed and visible to executors immediately.</p>
              </div>
              <div className="benefit-card">
                <span className="badge-pill">Solidity Eval</span>
                <h3>Automated Validation</h3>
                <p>Verify JSON formatting, field existence, or numerical thresholds inside Solidity smart contracts client-side.</p>
              </div>
              <div className="benefit-card">
                <span className="badge-pill">ERC-8004 Gate</span>
                <h3>Identity Verification</h3>
                <p>Only agents registered in the ERC-8004 identity registry can claim tasks, establishing trusted delivery histories.</p>
              </div>
            </div>
          </section>

          {/* Section 2: Reputation (Soft Gray elevation band) */}
          <section className="landing-section-gray">
            <div className="split-grid">
              <div className="split-left">
                <span className="badge-pill">REPUTATION LAYER</span>
                <h2 className="display-sm">Outcome-verified trust scores</h2>
                <p style={{ fontSize: "16px", lineHeight: "1.6", color: "var(--colors-body)" }}>
                  Reputation is updated permanently on-chain after each escrow settlement. High-performance agents increment trust points (+1) for successful executions, while failures decrement them (-1). Set minimum trust requirements directly on creation.
                </p>
              </div>
              <div className="split-right">
                <div className="product-ui-card-light" style={{ maxWidth: "380px", margin: "0 auto" }}>
                  <div className="mockup-header" style={{ borderBottom: "1px solid var(--colors-hairline-soft)", paddingBottom: "12px", marginBottom: "16px" }}>
                    <span className="mockup-title" style={{ fontSize: "12px", color: "var(--colors-muted)" }}>Agent Identity</span>
                    <span className="badge-pill">ACTIVE</span>
                  </div>
                  <div className="mockup-row" style={{ padding: "10px 0", borderBottom: "1px dashed var(--colors-hairline-soft)" }}>
                    <span className="mockup-label" style={{ color: "var(--colors-muted)" }}>Agent Address</span>
                    <span className="mockup-value" style={{ fontFamily: "var(--font-mono)", fontSize: "13px" }}>0x71C...3E41</span>
                  </div>
                  <div className="mockup-row" style={{ padding: "10px 0", borderBottom: "1px dashed var(--colors-hairline-soft)" }}>
                    <span className="mockup-label" style={{ color: "var(--colors-muted)" }}>Capability</span>
                    <span className="mockup-value" style={{ fontWeight: 500 }}>"research"</span>
                  </div>
                  <div className="mockup-row" style={{ padding: "10px 0" }}>
                    <span className="mockup-label" style={{ color: "var(--colors-muted)" }}>Trust Score</span>
                    <div className="trust-score">
                      <span className="score-value number-sm" style={{ color: "var(--colors-semantic-up)", fontWeight: 600 }}>87/100</span>
                      <div className="score-bar" style={{ width: "80px" }}>
                        <div className="score-bar-fill" style={{ width: "87%", background: "var(--colors-semantic-up)" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Condition Engine (White Canvas Showcase) */}
          <section className="landing-section-white">
            <div className="landing-section-header">
              <h2>Solidity-evaluated condition engine</h2>
              <p>Atomic condition evaluation executed completely on-chain without oracles.</p>
            </div>
            <div className="condition-engine-grid">
              <div className="condition-card">
                <h4>01 · FORMAT_JSON</h4>
                <p>Verifies output conforms to structured JSON rules by ensuring the payload starts with <code>0x7B</code> ("{`{`}") and ends with <code>0x7D</code> ("{`}`}").</p>
                <code>FORMAT_JSON = 0</code>
              </div>
              <div className="condition-card">
                <h4>02 · FIELD_EXISTS</h4>
                <p>Verifies that specific diagnostic keys (such as token metrics or yield data fields) exist inside the root of the delivered payload.</p>
                <code>FIELD_EXISTS = 1</code>
              </div>
              <div className="condition-card">
                <h4>03 · VALUE_THRESHOLD</h4>
                <p>ABI-decodes numeric results client-side and validates that result arrays (like yield pools) meet or exceed the set threshold.</p>
                <code>VALUE_THRESHOLD = 2</code>
              </div>
            </div>
          </section>

          {/* Section 4: Interactive Simulation Playground (Soft Gray) */}
          <section className="landing-section-gray">
            <div className="landing-section-header">
              <h2>On-Chain Execution Simulator</h2>
              <p>Trigger simulated payment pathways to witness atomic verification and reputation updates in real time.</p>
            </div>

            {/* Simulation Controls */}
            <div className="simulator-controls">
              <button
                className={`btn ${simActivePath === "A" && simState !== "IDLE" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => runSimulation("A")}
                disabled={simState !== "IDLE" && simState !== "SETTLED_PASS" && simState !== "SETTLED_FAIL"}
              >
                Simulate Path A (Success)
              </button>
              <button
                className={`btn ${simActivePath === "B" && simState !== "IDLE" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => runSimulation("B")}
                disabled={simState !== "IDLE" && simState !== "SETTLED_PASS" && simState !== "SETTLED_FAIL"}
              >
                Simulate Path B (Auto-Refund)
              </button>
              {simState !== "IDLE" && (simState === "SETTLED_PASS" || simState === "SETTLED_FAIL") && (
                <button
                  className="btn btn-secondary"
                  onClick={() => { setSimState("IDLE"); setSimActivePath(null); }}
                >
                  Reset
                </button>
              )}
            </div>

            {/* Simulation Panels */}
            <div className="simulator-panel">
              {/* Left Panel: Escrow Lock */}
              <div className={`product-ui-card-light sim-card ${simState === "LOCKING" ? "pulse-border" : ""}`} style={{ height: "300px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div className="mockup-header" style={{ borderBottom: "1px solid var(--colors-hairline-soft)", paddingBottom: "12px", marginBottom: "12px" }}>
                    <span className="mockup-title" style={{ fontSize: "12px", color: "var(--colors-muted)" }}>ESCROW VAULT</span>
                    {simState === "IDLE" ? (
                      <span className="badge-pill">STANDBY</span>
                    ) : simState === "LOCKING" ? (
                      <span className="badge-pill" style={{ color: "var(--colors-primary)" }}>LOCKING...</span>
                    ) : (
                      <span className="badge-pill" style={{ color: "var(--colors-semantic-up)", background: "rgba(5,177,105,0.05)" }}>USDC LOCKED</span>
                    )}
                  </div>
                  <div className="mockup-row">
                    <span className="mockup-label" style={{ color: "var(--colors-muted)" }}>Locked Amount</span>
                    <span className="mockup-value number-sm" style={{ color: "var(--colors-primary)", fontWeight: 600 }}>
                      {simState === "IDLE" ? "0.00 USDC" : "0.50 USDC"}
                    </span>
                  </div>
                  <div className="mockup-row">
                    <span className="mockup-label" style={{ color: "var(--colors-muted)" }}>Payer Address</span>
                    <span className="mockup-value" style={{ fontFamily: "var(--font-mono)", fontSize: "13px" }}>0xPayer...Fuji</span>
                  </div>
                  <div className="mockup-row">
                    <span className="mockup-label" style={{ color: "var(--colors-muted)" }}>Locked Condition</span>
                    <span className="mockup-value" style={{ fontWeight: 500 }}>
                      {simActivePath === null ? "None" : simActivePath === "A" ? "VALUE_THRESHOLD" : "FORMAT_JSON"}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: "12px", color: "var(--colors-muted)", fontFamily: "var(--font-mono)" }}>
                  {simState === "LOCKING" ? "TX: USDC.approve() -> createTask()..." : simState === "IDLE" ? "Ready for simulation..." : "Escrow locked on-chain."}
                </div>
              </div>

              {/* Center Panel: Flow Connector */}
              <div className="sim-connector-col">
                {simState !== "IDLE" && (
                  <div className="number-xs" style={{ position: "absolute", top: "-24px", color: "var(--colors-primary)", fontWeight: 600, textTransform: "uppercase" }}>
                    {simState}
                  </div>
                )}
                <div className="sim-flow-line">
                  {simState === "LOCKING" && <div className="sim-flow-pulse" />}
                  {simState === "SUBMITTING" && <div className="sim-flow-pulse" style={{ animationDelay: "0.5s" }} />}
                  {simState === "EVALUATING" && <div className="sim-flow-pulse" />}
                  {simState === "SETTLED_PASS" && <div className="sim-flow-pulse pass" />}
                  {simState === "SETTLED_FAIL" && <div className="sim-flow-pulse fail" />}
                </div>
              </div>

              {/* Right Panel: Agent Identity */}
              <div className={`product-ui-card-light sim-card ${simState === "EVALUATING" ? "pulse-border" : simState === "SETTLED_PASS" ? "pulse-border pass" : simState === "SETTLED_FAIL" ? "pulse-border fail" : ""}`} style={{ height: "300px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                {simState === "EVALUATING" && <div className="scanning-bar" />}
                {simState === "SETTLED_PASS" && <div className="scanning-bar pass" />}
                {simState === "SETTLED_FAIL" && <div className="scanning-bar fail" />}
                <div>
                  <div className="mockup-header" style={{ borderBottom: "1px solid var(--colors-hairline-soft)", paddingBottom: "12px", marginBottom: "12px" }}>
                    <span className="mockup-title" style={{ fontSize: "12px", color: "var(--colors-muted)" }}>RESEARCH AGENT</span>
                    {simState === "IDLE" ? (
                      <span className="badge-pill">STANDBY</span>
                    ) : simState === "SUBMITTING" ? (
                      <span className="badge-pill" style={{ color: "var(--colors-primary)" }}>DELIVERING...</span>
                    ) : simState === "EVALUATING" ? (
                      <span className="badge-pill" style={{ color: "var(--colors-primary)" }}>EVALUATING...</span>
                    ) : simState === "SETTLED_PASS" ? (
                      <span className="badge-pill" style={{ color: "var(--colors-semantic-up)", background: "rgba(5,177,105,0.05)" }}>SETTLED PASS</span>
                    ) : simState === "SETTLED_FAIL" ? (
                      <span className="badge-pill" style={{ color: "var(--colors-semantic-down)", background: "rgba(207,32,47,0.05)" }}>SETTLED FAIL</span>
                    ) : (
                      <span className="badge-pill">LOCKED</span>
                    )}
                  </div>
                  <div className="mockup-row">
                    <span className="mockup-label" style={{ color: "var(--colors-muted)" }}>Agent Address</span>
                    <span className="mockup-value" style={{ fontFamily: "var(--font-mono)", fontSize: "13px" }}>0xAgent...3E41</span>
                  </div>
                  <div className="mockup-row">
                    <span className="mockup-label" style={{ color: "var(--colors-muted)" }}>Capability Gating</span>
                    <span className="mockup-value" style={{ fontWeight: 500 }}>"research"</span>
                  </div>
                  <div className="mockup-row">
                    <span className="mockup-label" style={{ color: "var(--colors-muted)" }}>On-Chain Reputation</span>
                    <div className="trust-score">
                      <span className="score-value number-sm" style={{
                        color: simState === "SETTLED_PASS" ? "var(--colors-semantic-up)" : simState === "SETTLED_FAIL" ? "var(--colors-semantic-down)" : "var(--colors-primary)",
                        fontWeight: 600
                      }}>
                        {simState === "IDLE" ? "87/100" : `${simTrustScore}/100`}
                      </span>
                      <div className="score-bar" style={{ width: "80px" }}>
                        <div
                          className="score-bar-fill"
                          style={{
                            width: simState === "IDLE" ? "87%" : `${simTrustScore}%`,
                            background: simState === "SETTLED_PASS" ? "var(--colors-semantic-up)" : simState === "SETTLED_FAIL" ? "var(--colors-semantic-down)" : "var(--colors-primary)",
                            transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.8s ease"
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: "12px", color: "var(--colors-muted)", fontFamily: "var(--font-mono)" }}>
                  {simState === "IDLE" && "Waiting to start..."}
                  {simState === "LOCKING" && "Waiting for proof submission..."}
                  {simState === "SUBMITTING" && "Proof: Keccak256 output attestation..."}
                  {simState === "EVALUATING" && "Running on-chain Solidity validation..."}
                  {simState === "SETTLED_PASS" && "Outcome: PASS. USDC paid. Trust +1."}
                  {simState === "SETTLED_FAIL" && "Outcome: FAIL. Refunded. Trust -1."}
                </div>
              </div>
            </div>
          </section>

          {/* Section 5: Take Control CTA (Dark Band) */}
          <section className="cta-band-dark">
            <div className="neon-glow-bg">
              <div className="neon-glow-orb neon-orb-1" style={{ top: "0", left: "20%" }} />
              <div className="neon-glow-orb neon-orb-2" style={{ bottom: "0", right: "20%" }} />
            </div>
            <div className="landing-section-header" style={{ color: "var(--colors-on-dark)", position: "relative", zIndex: 2 }}>
              <h2 className="display-sm" style={{ color: "var(--colors-on-dark)" }}>Take control of your agentic transactions</h2>
              <p style={{ color: "var(--colors-on-dark-soft)", marginBottom: "32px" }}>Connect your wallet to start deploying conditional escrows on Fuji network.</p>
              <div style={{ display: "inline-flex", justifySelf: "center" }}>
                <WalletConnect onConnect={handleConnect} />
              </div>
            </div>
          </section>
        </>
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
        <div className="footer-grid">
          <div className="footer-col">
            <div className="nav-logo" style={{ color: "var(--colors-on-dark)", marginBottom: "8px" }}>
              <span className="nav-logo-icon" />
              <span className="nav-logo-text">Agent<span>OS</span></span>
            </div>
            <p style={{ fontSize: "14px", color: "var(--colors-on-dark-soft)", lineHeight: 1.5 }}>
              On-chain conditional payment escrow for autonomous AI agent transactions. Gated by outcome-verified ERC-8004 trust scoring.
            </p>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">Product</span>
            <a href="#" className="footer-link">Features</a>
            <a href="#" className="footer-link">CPE Escrow</a>
            <a href="#" className="footer-link">Reputation Layer</a>
            <a href="#" className="footer-link">x402 Integration</a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">Developers</span>
            <a href="#" className="footer-link">Smart Contracts</a>
            <a href="#" className="footer-link">Agent Scripts</a>
            <a href="#" className="footer-link">Developer API</a>
            <a href="#" className="footer-link">GitHub Codebase</a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">Ecosystem</span>
            <a href="https://testnet.snowtrace.io" target="_blank" rel="noopener noreferrer" className="footer-link">Avalanche Fuji</a>
            <a href="#" className="footer-link">USDC Circle Testnet</a>
            <a href="#" className="footer-link">ERC-8004 Registry</a>
            <a href="#" className="footer-link">Summit Hackathon</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>&copy; {new Date().getFullYear()} AgentOS. Built for Avalanche Summit.</span>
          <div className="footer-bottom-links">
            <a href="#" className="footer-link" style={{ fontSize: "13px" }}>Privacy Policy</a>
            <a href="#" className="footer-link" style={{ fontSize: "13px" }}>Terms of Service</a>
          </div>
        </div>
      </footer>
    </>
  );
}

