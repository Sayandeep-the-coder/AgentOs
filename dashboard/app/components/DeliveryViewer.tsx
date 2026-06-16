"use client";

import { useMemo } from "react";
import { CONDITION_LABELS, SNOWTRACE_BASE } from "@/lib/contracts";

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

interface DeliveryViewerProps {
  task: Task | null;
  taskId: bigint | null;
}

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
          // Decode bytes32 field name — remove trailing null bytes
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
        return `"${fieldStr}" array must have ≥ ${task.condition.threshold.toString()} entries`;
      }
      default: return "Unknown condition";
    }
  };

  if (!task || !isSettled) {
    return (
      <div className="glass-card full-width animate-slide-up" style={{ animationDelay: "0.3s" }}>
        <div className="card-header">
          <h2>
            <span style={{ fontSize: "20px" }}>📦</span>
            Delivery Viewer
          </h2>
        </div>
        <div className="card-body" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ fontSize: "32px", marginBottom: "12px" }}>⏳</p>
          <p style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>
            {task ? "Waiting for delivery submission..." : "No settled task to display."}
          </p>
          {task && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "12px", marginTop: "8px" }}>
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
          <span style={{ fontSize: "20px" }}>📦</span>
          Delivery Viewer — Task #{taskId?.toString()}
        </h2>
        <span className={`status-badge ${isPassed ? "status-pass" : "status-fail"}`}
              style={{ fontSize: "14px", padding: "8px 18px" }}>
          {isPassed ? "✅ CONDITION PASS" : "❌ CONDITION FAIL"}
        </span>
      </div>

      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Condition Evaluation */}
        <div style={{
          padding: "16px 20px",
          borderRadius: "var(--radius-md)",
          background: isPassed ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${isPassed ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600,
              padding: "4px 10px", borderRadius: "var(--radius-sm)",
              background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)"
            }}>
              {condLabel}
            </span>
          </div>
          <p style={{ fontSize: "14px", color: "var(--color-text-primary)" }}>
            {getConditionDescription()}
          </p>
          <p style={{
            fontSize: "13px", marginTop: "8px",
            color: isPassed ? "var(--color-pass)" : "var(--color-fail)",
            fontWeight: 600
          }}>
            Result: {isPassed ? "PASSED — USDC released to Research Agent" : "FAILED — USDC returned to Personal Agent"}
          </p>
        </div>

        {/* Settlement Details */}
        <div>
          <h3 style={{
            fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px"
          }}>
            Settlement Details
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div className="info-row">
              <span className="info-label">Output Hash</span>
              <span className="info-value" style={{ fontSize: "11px" }}>
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
            fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px"
          }}>
            Submitted Output
          </h3>
          <div className="json-viewer">
            {parsedOutput ? (
              <pre>{JSON.stringify(parsedOutput, null, 2)}</pre>
            ) : (
              <pre style={{ color: "var(--color-fail)" }}>{output || "No output data"}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
