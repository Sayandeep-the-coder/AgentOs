"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import { CONTRACTS, CPE_ABI, ERC8004_ABI, SNOWTRACE_BASE, STATUS_CONFIG, CONDITION_LABELS, FUJI_CHAIN } from "@/lib/contracts";

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

interface EscrowStatusProps {
  watchTaskId: bigint | null;
  onTaskUpdate: (task: Task) => void;
}

export default function EscrowStatus({ watchTaskId, onTaskUpdate }: EscrowStatusProps) {
  const [tasks, setTasks] = useState<Map<string, Task>>(new Map());
  const [agentScores, setAgentScores] = useState<Map<string, number>>(new Map());
  const [taskCount, setTaskCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const watchTaskIdRef = useRef(watchTaskId);
  const onTaskUpdateRef = useRef(onTaskUpdate);
  useEffect(() => {
    watchTaskIdRef.current = watchTaskId;
    onTaskUpdateRef.current = onTaskUpdate;
  });

  const getProvider = useCallback(() => {
    return new JsonRpcProvider(FUJI_CHAIN.rpcUrls[0]);
  }, []);

  const fetchTasks = useCallback(async () => {
    if (!CONTRACTS.cpe) return;
    setLoading(true);

    try {
      const provider = getProvider();
      const cpe = new Contract(CONTRACTS.cpe, CPE_ABI, provider);
      const erc8004 = new Contract(CONTRACTS.erc8004, ERC8004_ABI, provider);

      const count = await cpe.taskCount();
      setTaskCount(Number(count));

      const newTasks = new Map<string, Task>();
      const newScores = new Map<string, number>();

      // Fetch last 10 tasks (or all if fewer)
      const start = Math.max(0, Number(count) - 10);
      for (let i = start; i < Number(count); i++) {
        const task = await cpe.getTask(i);
        newTasks.set(i.toString(), task);

        // Fetch agent score if payee is set
        if (task.payee !== "0x0000000000000000000000000000000000000000") {
          try {
            const [score] = await erc8004.getAgent(task.payee);
            newScores.set(task.payee, Number(score));
          } catch { /* agent may not be registered */ }
        }

        // Notify parent of watched task
        if (watchTaskIdRef.current !== null && BigInt(i) === watchTaskIdRef.current) {
          onTaskUpdateRef.current(task);
        }
      }

      setTasks(newTasks);
      setAgentScores(newScores);
    } catch (err) {
      console.error("Error fetching tasks:", err);
    } finally {
      setLoading(false);
    }
  }, [getProvider]);

  // Poll every 3 seconds — initial fetch via interval callback (not synchronous in effect body)
  useEffect(() => {
    let cancelled = false;
    // Kick off initial fetch async — setState in async callback is fine
    const doInitialFetch = async () => {
      if (!cancelled) await fetchTasks();
    };
    doInitialFetch();

    const interval = setInterval(() => {
      fetchTasks();
      setNow(Date.now());
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchTasks]);

  const getStatusClass = (status: number) => {
    const classes = ["status-locked", "status-pending", "status-pass", "status-fail"];
    return classes[status] || "status-locked";
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "var(--color-pass)";
    if (score >= 50) return "var(--color-locked)";
    return "var(--color-fail)";
  };

  const formatDeadline = (deadline: bigint) => {
    const remaining = Number(deadline) * 1000 - now;
    if (remaining <= 0) return "Expired";
    const mins = Math.floor(remaining / 60000);
    if (mins < 60) return `${mins}m remaining`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="glass-card animate-slide-up" style={{ animationDelay: "0.2s" }}>
      <div className="card-header">
        <h2>
          <span style={{ fontSize: "20px" }}>📊</span>
          Escrow Status
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
            {taskCount} total task{taskCount !== 1 ? "s" : ""}
          </span>
          {loading && <span className="status-dot" style={{ color: "var(--color-blue)" }} />}
        </div>
      </div>

      <div className="card-body" style={{ padding: 0 }}>
        {tasks.size === 0 ? (
          <div style={{
            padding: "48px 24px", textAlign: "center",
            color: "var(--color-text-muted)", fontSize: "14px"
          }}>
            <p style={{ fontSize: "32px", marginBottom: "12px" }}>📭</p>
            <p>No tasks yet. Create one with the Condition Builder.</p>
          </div>
        ) : (
          <div style={{ maxHeight: "500px", overflowY: "auto" }}>
            {Array.from(tasks.entries()).reverse().map(([id, task]) => {
              const statusCfg = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG];
              const condLabel = CONDITION_LABELS[task.condition.conditionType as keyof typeof CONDITION_LABELS];
              const score = task.payee !== "0x0000000000000000000000000000000000000000"
                ? agentScores.get(task.payee)
                : undefined;
              const isWatched = watchTaskId !== null && id === watchTaskId.toString();

              return (
                <div
                  key={id}
                  style={{
                    padding: "16px 24px",
                    borderBottom: "1px solid var(--color-border)",
                    background: isWatched ? "rgba(99, 102, 241, 0.05)" : "transparent",
                    transition: "background 0.3s",
                  }}
                >
                  {/* Row 1: Task ID + Status */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700,
                      color: isWatched ? "var(--color-blue)" : "var(--color-text-primary)"
                    }}>
                      Task #{id}
                    </span>
                    <span className={`status-badge ${getStatusClass(task.status)}`}>
                      <span className="status-dot" />
                      {statusCfg.label}
                    </span>
                  </div>

                  {/* Row 2: Details */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "13px" }}>
                    <div className="info-row" style={{ padding: "6px 0" }}>
                      <span className="info-label">Amount</span>
                      <span className="info-value" style={{ color: "var(--color-pass)" }}>
                        {formatUnits(task.amount, 6)} USDC
                      </span>
                    </div>
                    <div className="info-row" style={{ padding: "6px 0" }}>
                      <span className="info-label">Condition</span>
                      <span className="info-value" style={{ fontSize: "11px" }}>{condLabel}</span>
                    </div>
                    <div className="info-row" style={{ padding: "6px 0" }}>
                      <span className="info-label">Deadline</span>
                      <span className="info-value" style={{ fontSize: "12px" }}>{formatDeadline(task.deadline)}</span>
                    </div>
                    {score !== undefined && (
                      <div className="info-row" style={{ padding: "6px 0" }}>
                        <span className="info-label">Agent Score</span>
                        <div className="trust-score">
                          <span className="score-value" style={{ color: getScoreColor(score), fontSize: "14px" }}>
                            {score}
                          </span>
                          <div className="score-bar" style={{ width: "60px" }}>
                            <div
                              className="score-bar-fill"
                              style={{ width: `${score}%`, background: getScoreColor(score) }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Agent addresses */}
                  <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <a
                      href={`${SNOWTRACE_BASE}/address/${task.payer}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tx-link"
                      style={{ fontSize: "11px" }}
                    >
                      Payer: {task.payer.slice(0, 8)}...
                    </a>
                    {task.payee !== "0x0000000000000000000000000000000000000000" && (
                      <a
                        href={`${SNOWTRACE_BASE}/address/${task.payee}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tx-link"
                        style={{ fontSize: "11px" }}
                      >
                        Payee: {task.payee.slice(0, 8)}...
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
