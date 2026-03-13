"use client";

import { useCallback, useEffect, useState } from "react";

type HeadState =
  | "Disconnected"
  | "Idle"
  | "Initializing"
  | "Open"
  | "Closed"
  | "FanoutPossible"
  | "Final"
  | "Aborted";

interface L2Utxo {
  txHash: string;
  index: number;
  lovelace: string;
}

interface LogEntry {
  ts: string;
  message: string;
}

function formatAda(lovelace: string): string {
  return (Number(lovelace) / 1_000_000).toFixed(2);
}

export default function Home() {
  const [state, setState] = useState<HeadState>("Disconnected");
  const [headId, setHeadId] = useState<string | null>(null);
  const [utxos, setUtxos] = useState<Array<L2Utxo>>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<LogEntry>>([]);

  const addLog = useCallback((message: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-49), { ts, message }]);
  }, []);

  // Poll head state every 2s when connected
  useEffect(() => {
    if (state === "Disconnected") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/head");
        const data = await res.json();
        if (data.state && data.state !== state) {
          setState(data.state);
          setHeadId(data.headId ?? null);
          addLog(`State changed to ${data.state}`);
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
    return () => clearInterval(id);
  }, [state, addLog]);

  // Fetch L2 UTxOs when head is Open
  useEffect(() => {
    if (state !== "Open") {
      setUtxos([]);
      return;
    }
    fetchUtxos();
  }, [state]);

  async function fetchUtxos() {
    try {
      const res = await fetch("/api/utxos");
      const data = await res.json();
      if (data.utxos) setUtxos(data.utxos);
    } catch {
      // ignore
    }
  }

  async function headAction(action: string) {
    setError(null);
    setLoading(action);
    addLog(`Sending ${action}...`);

    try {
      const res = await fetch("/api/head", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        addLog(`Error: ${data.error}`);
      } else {
        if (data.state) {
          setState(data.state);
          setHeadId(data.headId ?? headId);
        }
        addLog(
          `${action} succeeded${data.txHash ? ` (tx: ${data.txHash})` : ""}${data.committed ? ` — committed ${formatAda(data.committed)} ADA` : ""}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addLog(`Error: ${msg}`);
    } finally {
      setLoading(null);
    }
  }

  const isLoading = loading !== null;
  const isConnected = state !== "Disconnected";

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
        Hydra SDK — Next.js Example
      </h1>
      <p style={{ color: "#888", marginTop: 0, marginBottom: "1.5rem" }}>
        Server-side head management with API routes
      </p>

      {/* Status */}
      <Section title="Head Status">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <StatusDot connected={isConnected} />
          <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
            {state}
          </span>
          {headId && (
            <span style={{ color: "#666", fontSize: "0.85rem" }}>
              ID: {headId.slice(0, 16)}...
            </span>
          )}
        </div>
      </Section>

      {/* Actions */}
      <Section title="Actions">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {!isConnected ? (
            <Button
              onClick={() => headAction("connect")}
              disabled={isLoading}
              color="#4f46e5"
            >
              {loading === "connect" ? "Connecting..." : "Connect"}
            </Button>
          ) : (
            <>
              <Button
                onClick={() => headAction("init")}
                disabled={isLoading || state !== "Idle"}
                color="#2563eb"
              >
                Init
              </Button>
              <Button
                onClick={() => headAction("commit")}
                disabled={isLoading || state !== "Initializing"}
                color="#059669"
              >
                {loading === "commit" ? "Committing..." : "Commit"}
              </Button>
              <Button
                onClick={() => headAction("close")}
                disabled={isLoading || state !== "Open"}
                color="#d97706"
              >
                Close
              </Button>
              <Button
                onClick={() => headAction("fanout")}
                disabled={isLoading || state !== "FanoutPossible"}
                color="#7c3aed"
              >
                Fanout
              </Button>
              <Button
                onClick={() => headAction("abort")}
                disabled={
                  isLoading ||
                  (state !== "Idle" && state !== "Initializing")
                }
                color="#6b7280"
              >
                Abort
              </Button>
              <Button
                onClick={() => headAction("disconnect")}
                disabled={isLoading}
                color="#dc2626"
              >
                Disconnect
              </Button>
            </>
          )}
        </div>
      </Section>

      {/* L2 UTxOs */}
      {state === "Open" && (
        <Section title={`L2 UTxOs (${utxos.length})`}>
          <Button onClick={fetchUtxos} disabled={isLoading} color="#0891b2">
            Refresh
          </Button>
          {utxos.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.85rem",
                  fontFamily: "monospace",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid #333" }}>
                    <th style={{ textAlign: "left", padding: "0.5rem" }}>
                      UTxO
                    </th>
                    <th style={{ textAlign: "right", padding: "0.5rem" }}>
                      ADA
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {utxos.map((u, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #222" }}>
                      <td style={{ padding: "0.5rem", color: "#aaa" }}>
                        {u.txHash.slice(0, 16)}...#{u.index}
                      </td>
                      <td
                        style={{
                          padding: "0.5rem",
                          textAlign: "right",
                          color: "#22d3ee",
                        }}
                      >
                        {formatAda(u.lovelace)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ color: "#666", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                Total:{" "}
                {formatAda(
                  utxos
                    .reduce((sum, u) => sum + BigInt(u.lovelace), 0n)
                    .toString(),
                )}{" "}
                ADA
              </p>
            </div>
          )}
        </Section>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            background: "#450a0a",
            border: "1px solid #991b1b",
            borderRadius: 8,
            color: "#fca5a5",
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Event Log */}
      <Section title="Log">
        <div
          style={{
            maxHeight: 200,
            overflowY: "auto",
            background: "#111",
            border: "1px solid #222",
            borderRadius: 6,
            padding: "0.5rem",
            fontFamily: "monospace",
            fontSize: "0.8rem",
          }}
        >
          {logs.length === 0 ? (
            <span style={{ color: "#555" }}>No events yet.</span>
          ) : (
            logs.map((entry, i) => (
              <div key={i} style={{ padding: "0.15rem 0" }}>
                <span style={{ color: "#555" }}>{entry.ts}</span>{" "}
                <span style={{ color: "#ccc" }}>{entry.message}</span>
              </div>
            ))
          )}
        </div>
      </Section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function Section({
  children,
  title,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        marginTop: "1.25rem",
        padding: "1rem",
        background: "#141414",
        border: "1px solid #222",
        borderRadius: 8,
      }}
    >
      <h2
        style={{
          fontSize: "0.95rem",
          marginTop: 0,
          marginBottom: "0.75rem",
          color: "#999",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Button({
  children,
  color,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "0.4rem 1rem",
        background: disabled ? "#333" : color,
        color: disabled ? "#666" : "#fff",
        border: "none",
        borderRadius: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 500,
        fontSize: "0.85rem",
      }}
    >
      {children}
    </button>
  );
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: connected ? "#22c55e" : "#ef4444",
      }}
    />
  );
}
