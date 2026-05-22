"use client";

import { useState } from "react";
import { CameraScanner } from "./CameraScanner";

type Plan = {
  slug?: string;
  rail?: string;
  amountSat?: number;
  interval?: string;
};

type CheckResponse =
  | { active: false }
  | { active: true; plan: Plan; expiresAt: number; source?: string };

type State =
  | { kind: "idle" }
  | { kind: "checking"; input: string }
  | { kind: "denied"; input: string }
  | { kind: "granted"; input: string; resp: Extract<CheckResponse, { active: true }> }
  | { kind: "error"; message: string };

type Entry = {
  ts: number;
  input: string;
  outcome: "granted" | "denied" | "error";
  detail?: string;
};

export function DoorScanner({ merchantPubkey }: { merchantPubkey: string }) {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [history, setHistory] = useState<Entry[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);

  async function checkValue(rawInput: string) {
    const trimmed = rawInput.trim();
    if (!trimmed) return;
    setState({ kind: "checking", input: trimmed });
    try {
      const url = `/api/check?m=${encodeURIComponent(merchantPubkey)}&u=${encodeURIComponent(trimmed)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        const msg = error ?? `HTTP ${res.status}`;
        setState({ kind: "error", message: msg });
        setHistory((h) => [
          { ts: Date.now(), input: trimmed, outcome: "error" as const, detail: msg },
          ...h,
        ].slice(0, 10));
        return;
      }
      const data = (await res.json()) as CheckResponse;
      if (data.active) {
        setState({ kind: "granted", input: trimmed, resp: data });
        setHistory((h) => [
          { ts: Date.now(), input: trimmed, outcome: "granted" as const, detail: data.plan.slug },
          ...h,
        ].slice(0, 10));
      } else {
        setState({ kind: "denied", input: trimmed });
        setHistory((h) => [
          { ts: Date.now(), input: trimmed, outcome: "denied" as const },
          ...h,
        ].slice(0, 10));
      }
      setInput("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error de red";
      setState({ kind: "error", message: msg });
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    checkValue(input);
  }

  function onCameraScan(raw: string) {
    setCameraOpen(false);
    setInput(raw);
    checkValue(raw);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          placeholder="npub1… o 64 chars hex"
          className="block flex-1 rounded-xl border border-ink-700 bg-ink-950/60 px-4 py-3 font-mono text-sm text-ink-100 placeholder:text-ink-500 focus:border-bolt-500 focus:outline-none focus:ring-1 focus:ring-bolt-500"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-ink-700 px-4 py-3 text-sm font-semibold text-ink-100 transition hover:border-bolt-500 hover:bg-ink-800"
            title="Escanear QR con la cámara"
          >
            <CameraIcon className="h-4 w-4" />
            Escanear
          </button>
          <button
            type="submit"
            disabled={state.kind === "checking" || !input.trim()}
            className="rounded-xl bg-bolt-500 px-6 py-3 text-sm font-semibold text-ink-950 transition hover:bg-bolt-400 disabled:opacity-50"
          >
            {state.kind === "checking" ? "Verificando…" : "Verificar"}
          </button>
        </div>
      </form>

      {cameraOpen && (
        <CameraScanner
          onScan={onCameraScan}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {state.kind === "granted" && <GrantedCard state={state} />}
      {state.kind === "denied" && <DeniedCard input={state.input} />}
      {state.kind === "error" && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
          {state.message}
        </p>
      )}

      {history.length > 0 && (
        <section>
          <p className="text-xs uppercase tracking-wider text-ink-400">
            Últimas {history.length} verificaciones
          </p>
          <ul className="mt-3 space-y-2">
            {history.map((h, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-950/40 p-3"
              >
                <span
                  className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                    h.outcome === "granted"
                      ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : h.outcome === "denied"
                        ? "border border-red-500/40 bg-red-500/10 text-red-300"
                        : "border border-ink-700 bg-ink-800 text-ink-300"
                  }`}
                >
                  {h.outcome}
                </span>
                <code className="truncate font-mono text-xs text-ink-300">
                  {h.input.slice(0, 16)}…
                </code>
                <span className="ml-auto text-[10px] text-ink-500">
                  {new Date(h.ts).toLocaleTimeString("es-AR")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function GrantedCard({ state }: { state: Extract<State, { kind: "granted" }> }) {
  const expires = new Date(state.resp.expiresAt * 1000);
  return (
    <div className="rounded-2xl border-2 border-emerald-500/60 bg-emerald-500/10 p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <CheckIcon className="h-8 w-8 text-emerald-400" />
        <p className="text-3xl font-bold tracking-tight text-emerald-300 sm:text-4xl">
          BIENVENIDO
        </p>
      </div>
      <code className="mt-4 block truncate font-mono text-sm text-emerald-200">
        {state.input}
      </code>
      <dl className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <Detail label="Plan">
          <code className="font-mono">{state.resp.plan.slug ?? "?"}</code>
        </Detail>
        <Detail label="Monto">
          <span className="font-mono text-bolt-500">
            {state.resp.plan.amountSat?.toLocaleString("es-AR") ?? "?"}
          </span>{" "}
          sat / {state.resp.plan.interval ?? "?"}
        </Detail>
        <Detail label="Vence">
          {expires.toLocaleString("es-AR", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Detail>
      </dl>
      {state.resp.source && (
        <p className="mt-4 text-xs text-emerald-400/70">
          verificado contra {state.resp.source === "charge" ? "el último cobro" : "el evento de suscripción"}
        </p>
      )}
    </div>
  );
}

function DeniedCard({ input }: { input: string }) {
  return (
    <div className="rounded-2xl border-2 border-red-500/60 bg-red-500/10 p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <XIcon className="h-8 w-8 text-red-400" />
        <p className="text-3xl font-bold tracking-tight text-red-300 sm:text-4xl">
          NO MIEMBRO
        </p>
      </div>
      <code className="mt-4 block truncate font-mono text-sm text-red-200">
        {input}
      </code>
      <p className="mt-4 text-sm text-red-300/80">
        No encontramos una suscripción activa de este pubkey para tus planes.
        Capaz nunca se suscribió, capaz se le venció.
      </p>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-emerald-400/70">{label}</dt>
      <dd className="mt-1 text-emerald-100">{children}</dd>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
