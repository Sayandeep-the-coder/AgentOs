"use client";

import { useMemo } from "react";
import { CONDITION_LABELS, SNOWTRACE_BASE } from "@/lib/contracts";

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

interface DeliveryViewerProps {
  task: Task | null;
  taskId: bigint | null;
}

/* Inline SVG icons */
const PackageIcon = () => (
  <svg className="icon-inline" viewBox="0 0 24 24">
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const CheckIcon = () => (
  <svg className="icon-inline" viewBox="0 0 24 24" style={{ color: "var(--colors-semantic-up)" }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon = () => (
  <svg className="icon-inline" viewBox="0 0 24 24" style={{ color: "var(--colors-semantic-down)" }}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ClockIcon = () => (
  <svg className="icon-inline" viewBox="0 0 24 24" style={{ color: "var(--colors-muted)" }}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export default function DeliveryViewer({ task, taskId }: DeliveryViewerProps) {
  const { output, parsedOutput } = useMemo(() => {
    if (!task?.resultUri) {
      return { output: "", parsedOutput: null };
    }

    try {
      const uri = task.resultUri;
      if (uri.startsWith("data:application/json,")) {
        const decoded = decodeURIComponent(uri.replace("data:application/json,", ""));
        try {
          return { output: decoded, parsedOutput: JSON.parse(decoded) };
        } catch {
          return { output: decoded, parsedOutput: null };
        }
      } else if (uri.startsWith("data:text/plain,")) {
        const decoded = decodeURIComponent(uri.replace("data:text/plain,", ""));
        return { output: decoded, parsedOutput: null };
      } else {
        return { output: uri, parsedOutput: null };
      }
    } catch {
      return { output: "Error decoding output", parsedOutput: null };
    }
  }, [task?.resultUri]);

  const isPassed = task?.status === 2;
  const isFailed = task?.status === 3;
  const isSettled = isPassed || isFailed;
  const condLabel = task ? CONDITION_LABELS[task.condition.conditionType as keyof typeof CONDITION_LABELS] : "";

  // Decode condition details
  const getConditionDescription = () => {
    if (!task) return "";
    switch (task.condition.conditionType) {
      case 0: return "Output must be valid JSON (starts with '{', ends with '}')";
      case 1: {
        let fieldStr = "";
        try {
          const hex = task.condition.fieldName;
          const bytes = [];
          for (let i = 2; i < hex.length; i += 2) {
            const byte = parseInt(hex.substr(i, 2), 16);
            if (byte === 0) break;
            bytes.push(byte);
          }
          fieldStr = String.fromCharCode(...bytes);
        } catch {
          fieldStr = task.condition.fieldName;
        }
        return `Output must contain field "${fieldStr}"`;
      }
      case 2: {
        let fieldStr = "";
        try {
          const hex = task.condition.fieldName;
          const bytes = [];
          for (let i = 2; i < hex.length; i += 2) {
            const byte = parseInt(hex.substr(i, 2), 16);
            if (byte === 0) break;
            bytes.push(byte);
          }
          fieldStr = String.fromCharCode(...bytes);
        } catch {
          fieldStr = "array";
        }
        return `"${fieldStr}" array must have \u2265 ${task.condition.threshold.toString()} entries`;
      }
      default: return "Unknown condition";
    }
  };

  if (!task || !isSettled) {
    return (
      <div className="glass-card full-width animate-slide-up" style={{ animationDelay: "0.3s" }}>
        <div className="card-header">
          <h2>
            <PackageIcon />
            Delivery Viewer
          </h2>
        </div>
        <div className="card-body" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "var(--rounded-md)",
            background: "var(--colors-surface-soft)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 12px"
          }}>
            <ClockIcon />
          </div>
          <p style={{ color: "var(--colors-muted)", fontSize: "13px" }}>
            {task ? "Waiting for delivery submission..." : "No settled task to display."}
          </p>
          {task && (
            <p style={{ color: "var(--colors-muted)", fontSize: "11px", marginTop: "6px" }} className="number-sm">
              Task #{taskId?.toString()} is {task.status === 0 ? "LOCKED" : "PENDING_PROOF"}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card full-width animate-slide-up" style={{ animationDelay: "0.3s" }}>
      <div className="card-header">
        <h2>
          <PackageIcon />
          Delivery Viewer — Task #<span className="number-sm" style={{ fontWeight: 600 }}>{taskId?.toString()}</span>
        </h2>
        <span
          className={`status-badge ${isPassed ? "status-pass" : "status-fail"}`}
          style={{ fontSize: "12px", padding: "6px 14px" }}
        >
          {isPassed ? <CheckIcon /> : <XIcon />}
          {isPassed ? "CONDITION PASS" : "CONDITION FAIL"}
        </span>
      </div>

      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        {/* Condition Evaluation */}
        <div className={`settlement-banner ${isPassed ? "pass" : "fail"}`} style={{ display: "block", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <span className="number-xs" style={{
              padding: "3px 8px", borderRadius: "var(--rounded-xs)",
              background: "var(--colors-surface-strong)", color: "var(--colors-ink)"
            }}>
              {condLabel}
            </span>
          </div>
          <p style={{ fontSize: "14px", color: "var(--colors-ink)", lineHeight: 1.5, marginBottom: "8px" }}>
            {getConditionDescription()}
          </p>
          <p className="number-sm" style={{ fontWeight: 600 }}>
            {isPassed ? "PASSED \u2014 USDC released to Research Agent" : "FAILED \u2014 USDC returned to Personal Agent"}
          </p>
        </div>

        {/* Settlement Details */}
        <div>
          <h3 style={{
            fontSize: "12px", fontWeight: 600, color: "var(--colors-muted)",
            textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "10px"
          }}>
            Settlement Details
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <div className="info-row">
              <span className="info-label">Output Hash</span>
              <span className="info-value number-sm" style={{ fontSize: "12px" }}>
                {task.outputHash.slice(0, 18)}...
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Recipient</span>
              <a
                href={`${SNOWTRACE_BASE}/address/${isPassed ? task.payee : task.payer}`}
                target="_blank" rel="noopener noreferrer" className="tx-link"
              >
                {(isPassed ? task.payee : task.payer).slice(0, 10)}...
              </a>
            </div>
          </div>
        </div>

        {/* Submitted Output */}
        <div>
          <h3 style={{
            fontSize: "12px", fontWeight: 600, color: "var(--colors-muted)",
            textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "10px"
          }}>
            Submitted Output
          </h3>
          <div className="json-viewer">
            {parsedOutput ? (
              <pre>{JSON.stringify(parsedOutput, null, 2)}</pre>
            ) : (
              <pre style={{ color: "var(--colors-semantic-down)" }}>{output || "No output data"}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
