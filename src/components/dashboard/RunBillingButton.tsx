"use client";

import { useState } from "react";

type Outcome =
  | { sub: string; result: "skipped"; reason: string }
  | { sub: string; result: "paid"; preimage: string }
  | { sub: string; result: "failed"; error: string };

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; outcomes: Outcome[]; at: number }
  | { kind: "error"; message: string };

// Manual trigger for /api/cron/billing. Uses the session cookie for
// auth — the server route accepts either Bearer CRON_SECRET (scheduled)
// or a logged-in session (this button).
export function RunBillingButton() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function run() {
    setState({ kind: "running" });
    try {
      const res = await fetch("/api/cron/billing", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setState({ kind: "done", outcomes: data.outcomes ?? [], at: data.processedAt });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "error de red",
      });
    }
  }

  return (
    <section className="mt-12 rounded-2xl border border-ink-800 bg-ink-900/40 p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-lg font-semibold text-ink-100">Disparar cobros ahora</h2>
          <p className="mt-2 text-sm text-ink-300">
            En producción esto lo corre un cron cada N minutos. Para demo, lo
            disparás vos: lee de relays todas las suscripciones vencidas,
            decripta el NWC del subscriber, pide invoice a la LN address del
            plan y dispara <code className="font-mono">pay_invoice</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={state.kind === "running"}
          className="inline-flex items-center gap-2 rounded-full bg-bolt-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-bolt-400 disabled:opacity-50"
        >
          {state.kind === "running" ? "Procesando…" : "Correr ahora"}
        </button>
      </div>

      {state.kind === "error" && (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
          {state.message}
        </p>
      )}

      {state.kind === "done" && (
        <div className="mt-6">
          <p className="text-xs uppercase tracking-wider text-ink-400">
            {state.outcomes.length === 0
              ? "no había suscripciones para procesar"
              : `${state.outcomes.length} suscripción${state.outcomes.length === 1 ? "" : "es"} procesadas`}
          </p>
          {state.outcomes.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">
              {state.outcomes.map((o, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-ink-800 bg-ink-950/40 p-3"
                >
                  <span
                    className={`mt-0.5 inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      o.result === "paid"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : o.result === "skipped"
                          ? "bg-ink-800 text-ink-300"
                          : "bg-red-500/15 text-red-300"
                    }`}
                  >
                    {o.result}
                  </span>
                  <div className="min-w-0">
                    <code className="block truncate font-mono text-[10px] text-ink-400">
                      {o.sub}
                    </code>
                    <p className="mt-1 text-xs text-ink-300">
                      {o.result === "paid" && (
                        <>
                          preimage <code className="font-mono">{o.preimage}…</code>
                        </>
                      )}
                      {o.result === "skipped" && o.reason}
                      {o.result === "failed" && o.error}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
