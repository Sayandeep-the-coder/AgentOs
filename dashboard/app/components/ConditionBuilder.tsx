"use client";

import { useState } from "react";
import { Contract, BrowserProvider, parseUnits, encodeBytes32String } from "ethers";
import { CONTRACTS, CPE_ABI, USDC_ABI, SNOWTRACE_BASE } from "@/lib/contracts";

interface ConditionBuilderProps {
  provider: BrowserProvider | null;
  onTaskCreated: (taskId: bigint) => void;
}

export default function ConditionBuilder({ provider, onTaskCreated }: ConditionBuilderProps) {
  const [condType, setCondType] = useState<number>(2);
  const [fieldName, setFieldName] = useState("yield_opportunities");
  const [threshold, setThreshold] = useState("3");
  const [amount, setAmount] = useState("0.5");
  const [deadlineHours, setDeadlineHours] = useState("1");
  const [loading, setLoading] = useState(false);
  const [txLinks, setTxLinks] = useState<{ label: string; hash: string }[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<string>("");

  const createTask = async () => {
    if (!provider) return;
    setLoading(true);
    setError("");
    setTxLinks([]);

    try {
      const signer = await provider.getSigner();
      const cpe = new Contract(CONTRACTS.cpe, CPE_ABI, signer);
      const usdc = new Contract(CONTRACTS.usdc, USDC_ABI, signer);

      const amountWei = parseUnits(amount, 6);
      const deadline = Math.floor(Date.now() / 1000) + parseInt(deadlineHours) * 3600;
      const fieldBytes = encodeBytes32String(fieldName || "");

      // Step 1: Approve USDC
      setStatus("Approving USDC... (confirm in MetaMask)");
      const approveTx = await usdc.approve(CONTRACTS.cpe, amountWei);
      setTxLinks(prev => [...prev, { label: "USDC Approval", hash: approveTx.hash }]);
      await approveTx.wait();
      setStatus("USDC approved ✓");

      // Step 2: Create Task
      setStatus("Creating task... (confirm in MetaMask)");
      const createTx = await cpe.createTask(
        amountWei,
        condType,
        fieldBytes,
        parseInt(threshold) || 0,
        deadline
      );
      setTxLinks(prev => [...prev, { label: "Task Created", hash: createTx.hash }]);
      const receipt = await createTx.wait();

      // Extract taskId
      const event = receipt.logs
        .map((log: { topics: string[]; data: string }) => {
          try { return cpe.interface.parseLog(log); } catch { return null; }
        })
        .find((e: { name: string } | null) => e?.name === "TaskCreated");

      if (event) {
        const taskId = event.args.taskId;
        setStatus(`Task ${taskId.toString()} created — USDC locked ✅`);
        onTaskCreated(taskId);
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message?.slice(0, 200) || "Transaction failed");
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  const conditionLabels = ["FORMAT_JSON", "FIELD_EXISTS", "VALUE_THRESHOLD"];

  return (
    <div className="glass-card animate-slide-up" style={{ animationDelay: "0.1s" }}>
      <div className="card-header">
        <h2>
          <span style={{ fontSize: "20px" }}>⚙️</span>
          Condition Builder
        </h2>
        {status && (
          <span className={`status-badge ${status.includes("✅") ? "status-pass" : "status-pending"}`}>
            <span className="status-dot" />
            {status.includes("✅") ? "Created" : "Processing"}
          </span>
        )}
      </div>

      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Condition Type */}
        <div className="form-group">
          <label>Condition Type</label>
          <select
            className="input-field"
            value={condType}
            onChange={e => setCondType(parseInt(e.target.value))}
            id="condition-type-select"
          >
            {conditionLabels.map((label, i) => (
              <option key={i} value={i}>{label}</option>
            ))}
          </select>
        </div>

        {/* Conditional fields */}
        <div className="form-row">
          {(condType === 1 || condType === 2) && (
            <div className="form-group">
              <label>Field Name</label>
              <input
                className="input-field"
                type="text"
                value={fieldName}
                onChange={e => setFieldName(e.target.value)}
                placeholder="e.g. yield_opportunities"
                id="field-name-input"
              />
            </div>
          )}
          {condType === 2 && (
            <div className="form-group">
              <label>Threshold</label>
              <input
                className="input-field"
                type="number"
                min="1"
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
                placeholder="Minimum count"
                id="threshold-input"
              />
            </div>
          )}
        </div>

        {/* Amount + Deadline */}
        <div className="form-row">
          <div className="form-group">
            <label>USDC Amount</label>
            <input
              className="input-field"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.50"
              id="usdc-amount-input"
            />
          </div>
          <div className="form-group">
            <label>Deadline (hours)</label>
            <input
              className="input-field"
              type="number"
              min="1"
              value={deadlineHours}
              onChange={e => setDeadlineHours(e.target.value)}
              placeholder="1"
              id="deadline-input"
            />
          </div>
        </div>

        {/* Create Button */}
        <button
          className="btn btn-primary"
          onClick={createTask}
          disabled={loading || !provider || !CONTRACTS.cpe}
          id="create-task-btn"
          style={{ width: "100%", padding: "14px" }}
        >
          {loading ? (
            <>
              <span className="status-dot" style={{ background: "#fff" }} />
              Processing...
            </>
          ) : (
            <>🔒 Lock USDC &amp; Create Task</>
          )}
        </button>

        {/* Error */}
        {error && (
          <div style={{
            padding: "12px 16px", borderRadius: "var(--radius-md)",
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
            color: "var(--color-fail)", fontSize: "13px", wordBreak: "break-word"
          }}>
            ❌ {error}
          </div>
        )}

        {/* TX Links */}
        {txLinks.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {txLinks.map((tx, i) => (
              <a
                key={i}
                href={`${SNOWTRACE_BASE}/tx/${tx.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tx-link"
              >
                ↗ {tx.label}: {tx.hash.slice(0, 10)}...{tx.hash.slice(-6)}
              </a>
            ))}
          </div>
        )}

        {/* Status text */}
        {status && !status.includes("✅") && (
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{status}</p>
        )}
      </div>
    </div>
  );
}
