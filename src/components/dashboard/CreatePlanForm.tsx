"use client";

import { useState } from "react";
import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import {
  buildPlanEventTemplate,
  PLAN_EVENT_KIND,
} from "@/lib/nostr/plan-event";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://purplepag.es",
];

type Result = {
  naddr: string;
  acceptedRelays: string[];
  totalRelays: number;
};

type State =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "publishing"; progress: string }
  | { kind: "done"; result: Result }
  | { kind: "error"; message: string };

const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export function CreatePlanForm({ pubkey }: { pubkey: string }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [tenantSlug, setTenantSlug] = useState("");
  const [amountSat, setAmountSat] = useState("");
  const [interval, setInterval] = useState<"weekly" | "monthly" | "quarterly" | "yearly">("monthly");
  const [rail, setRail] = useState<"self" | "wapupay">("self");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  function onNameChange(v: string) {
    setName(v);
    if (!slugDirty) setSlug(slugify(v));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!window.nostr) {
      setState({ kind: "error", message: "Necesitás una extensión Nostr (NIP-07)." });
      return;
    }

    let template;
    try {
      template = buildPlanEventTemplate({
        pubkey,
        slug,
        name,
        description: description || null,
        amountSat: Number(amountSat),
        interval,
        rail,
        tenantSlug: tenantSlug || slug,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "validación falló",
      });
      return;
    }

    setState({ kind: "signing" });
    let signed;
    try {
      signed = await window.nostr.signEvent(template);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "firma rechazada";
      setState({ kind: "error", message: /reject|deny|cancel/i.test(msg) ? "rechazado en la wallet" : msg });
      return;
    }

    setState({ kind: "publishing", progress: `0 / ${DEFAULT_RELAYS.length} relays` });
    try {
      const ndk = new NDK({ explicitRelayUrls: DEFAULT_RELAYS });
      await ndk.connect(3000);
      const ndkEvent = new NDKEvent(ndk, signed);
      const accepted = await ndkEvent.publish(undefined, 5000);
      const acceptedRelays = Array.from(accepted).map((r) => r.url);
      const naddr = nip19.naddrEncode({
        identifier: slug,
        pubkey,
        kind: PLAN_EVENT_KIND,
        relays: acceptedRelays.slice(0, 3),
      });
      setState({
        kind: "done",
        result: { naddr, acceptedRelays, totalRelays: DEFAULT_RELAYS.length },
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "publicación falló",
      });
    }
  }

  const busy = state.kind === "signing" || state.kind === "publishing";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Nombre del plan" hint="Visible para los suscriptores.">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Cowork — martes"
            className={inputCls}
          />
        </Field>
        <Field label="Slug" hint="Identificador único del plan.">
          <input
            type="text"
            required
            pattern="^[a-z0-9-]+$"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugDirty(true);
            }}
            placeholder="cowork-martes"
            className={`${inputCls} font-mono`}
          />
        </Field>
        <Field label="Monto (sats)" hint="Por cada ciclo de cobro.">
          <input
            type="number"
            min={1}
            step={1}
            required
            value={amountSat}
            onChange={(e) => setAmountSat(e.target.value)}
            placeholder="5000"
            className={inputCls}
          />
        </Field>
        <Field label="Frecuencia">
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value as typeof interval)}
            className={inputCls}
          >
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensual</option>
            <option value="quarterly">Trimestral</option>
            <option value="yearly">Anual</option>
          </select>
        </Field>
        <Field label="Cómo recibís" hint="Self = NWC propia (sats). Wapupay = saldo ARS.">
          <select
            value={rail}
            onChange={(e) => setRail(e.target.value as typeof rail)}
            className={inputCls}
          >
            <option value="self">Self (sats al wallet)</option>
            <option value="wapupay">Wapupay (ARS)</option>
          </select>
        </Field>
        <Field label="Slug del tenant" hint="Tu handle público. Por ahora opcional.">
          <input
            type="text"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            placeholder="lacrypta"
            className={`${inputCls} font-mono`}
          />
        </Field>
      </div>

      <Field label="Descripción (opcional)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Acceso al cowork de La Crypta los días martes, de 10 a 18 hs."
          className={inputCls}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-bolt-500 px-6 py-3 text-sm font-semibold text-ink-950 transition hover:bg-bolt-400 disabled:opacity-50"
        >
          {state.kind === "signing" && "Firmando…"}
          {state.kind === "publishing" && "Publicando…"}
          {(state.kind === "idle" || state.kind === "done" || state.kind === "error") && "Firmar y publicar"}
        </button>
        {state.kind === "publishing" && (
          <span className="text-xs text-ink-300">{state.progress}</span>
        )}
        {state.kind === "error" && (
          <span className="text-xs text-red-400">{state.message}</span>
        )}
      </div>

      {state.kind === "done" && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <p className="text-sm text-emerald-300">
            Publicado en {state.result.acceptedRelays.length} / {state.result.totalRelays} relays.
          </p>
          <p className="mt-2 text-xs text-ink-300">naddr para compartir:</p>
          <code className="mt-1 block break-all rounded bg-ink-950/60 p-3 font-mono text-xs text-ink-100">
            {state.result.naddr}
          </code>
          {state.result.acceptedRelays.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-ink-400">
              {state.result.acceptedRelays.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}

const inputCls =
  "block w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:border-bolt-500 focus:outline-none focus:ring-1 focus:ring-bolt-500";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wider text-ink-300">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}
