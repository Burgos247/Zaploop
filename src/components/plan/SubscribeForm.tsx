"use client";

import { useState } from "react";

type Props = { planNaddr: string };
type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | {
      kind: "done";
      subscriptionId: string;
      nextChargeAt: number | null;
      currentPeriodEnd: number;
    }
  | { kind: "error"; message: string };

export function SubscribeForm({ planNaddr }: Props) {
  const [nwcUri, setNwcUri] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planNaddr, nwcUri: nwcUri.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: data.error ?? "no se pudo crear la suscripción" });
        return;
      }
      setState({
        kind: "done",
        subscriptionId: data.subscriptionId,
        nextChargeAt: data.nextChargeAt,
        currentPeriodEnd: data.currentPeriodEnd,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "error de red",
      });
    }
  }

  if (state.kind === "done") {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <p className="text-sm font-semibold text-emerald-300">
          Suscripción creada
        </p>
        <p className="mt-2 text-xs text-ink-300">
          ID: <code className="font-mono">{state.subscriptionId.slice(0, 8)}…</code>
        </p>
        <p className="mt-1 text-xs text-ink-300">
          El primer cobro está programado al instante. Si la wallet no responde
          o falla, la suscripción queda en estado{" "}
          <code className="font-mono">past_due</code> hasta el reintento.
        </p>
      </div>
    );
  }

  const busy = state.kind === "submitting";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-wider text-ink-300">
          Tu NWC connection
        </span>
        <input
          type="text"
          required
          autoComplete="off"
          spellCheck={false}
          value={nwcUri}
          onChange={(e) => setNwcUri(e.target.value)}
          placeholder="nostr+walletconnect://…"
          className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-xs text-ink-100 placeholder:text-ink-500 focus:border-bolt-500 focus:outline-none focus:ring-1 focus:ring-bolt-500"
        />
        <span className="mt-1 block text-xs text-ink-400">
          Generala en Alby Hub, Mutiny o Phoenix con un budget mensual igual al
          monto del plan. Nunca la mostramos a nadie — se guarda encriptada en
          servidor.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-bolt-500 px-6 py-3 text-sm font-semibold text-ink-950 transition hover:bg-bolt-400 disabled:opacity-50"
        >
          {busy ? "Creando…" : "Suscribirme"}
        </button>
        {state.kind === "error" && (
          <span className="text-xs text-red-400">{state.message}</span>
        )}
      </div>
    </form>
  );
}
