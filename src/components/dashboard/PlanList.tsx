"use client";

import { useEffect, useMemo, useState } from "react";
import NDK, { type NDKEvent } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import {
  PLAN_EVENT_KIND,
  PLAN_TAG,
  parsePlanEvent,
} from "@/lib/nostr/plan-event";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://purplepag.es",
];

type ParsedPlan = ReturnType<typeof parsePlanEvent>;

type LoadedEvent = {
  id: string;
  created_at: number;
  parsed: ParsedPlan;
};

type Status = "connecting" | "loading" | "ready" | "error";

export function PlanList({ pubkey }: { pubkey: string }) {
  // Keyed by `d` tag — replaceable events with the same d collapse to one row.
  const [byD, setByD] = useState<Map<string, LoadedEvent>>(new Map());
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ndk = new NDK({ explicitRelayUrls: DEFAULT_RELAYS });
    let cancelled = false;

    (async () => {
      try {
        await ndk.connect(3000);
        if (cancelled) return;
        setStatus("loading");

        const sub = ndk.subscribe(
          {
            kinds: [PLAN_EVENT_KIND],
            authors: [pubkey],
            "#t": [PLAN_TAG],
          },
          { closeOnEose: false },
        );

        sub.on("event", (evt: NDKEvent) => {
          const d = evt.tags.find((t) => t[0] === "d")?.[1];
          if (!d) return;
          setByD((prev) => {
            const existing = prev.get(d);
            if (existing && existing.created_at >= evt.created_at!) return prev;
            const next = new Map(prev);
            next.set(d, {
              id: evt.id ?? "",
              created_at: evt.created_at ?? 0,
              parsed: parsePlanEvent({
                kind: evt.kind!,
                pubkey: evt.pubkey,
                tags: evt.tags,
              }),
            });
            return next;
          });
        });
        sub.on("eose", () => {
          if (!cancelled) setStatus("ready");
        });
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "no pude conectar a los relays");
      }
    })();

    return () => {
      cancelled = true;
      // NDK keeps relays open process-wide; closing the pool here would
      // affect other components. Just stop listening.
    };
  }, [pubkey]);

  const plans = useMemo(
    () =>
      Array.from(byD.values()).sort((a, b) => b.created_at - a.created_at),
    [byD],
  );

  return (
    <section className="mt-12">
      <div className="flex items-end justify-between">
        <h2 className="text-xl font-semibold tracking-tight text-ink-100">
          Tus planes
        </h2>
        <span className="text-xs text-ink-400">
          {status === "connecting" && "conectando a relays…"}
          {status === "loading" && "leyendo eventos…"}
          {status === "ready" && `${plans.length} ${plans.length === 1 ? "plan" : "planes"}`}
          {status === "error" && "error"}
        </span>
      </div>

      {status === "error" && (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
          {error}
        </p>
      )}

      {status === "ready" && plans.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-ink-700 bg-ink-900/30 p-6 text-sm text-ink-300">
          Todavía no publicaste planes en estos relays. Usá el formulario de
          arriba — el plan va a aparecer acá apenas confirme cualquier relay.
        </p>
      )}

      {plans.length > 0 && (
        <ul className="mt-4 space-y-3">
          {plans.map((p) => (
            <PlanCard key={p.parsed.slug ?? p.id} event={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PlanCard({ event }: { event: LoadedEvent }) {
  const p = event.parsed;
  const [copied, setCopied] = useState(false);
  const naddr = useMemo(() => {
    if (!p.slug) return null;
    try {
      return nip19.naddrEncode({
        identifier: p.slug,
        pubkey: p.pubkey,
        kind: PLAN_EVENT_KIND,
        relays: DEFAULT_RELAYS.slice(0, 3),
      });
    } catch {
      return null;
    }
  }, [p.slug, p.pubkey]);

  async function copy() {
    if (!naddr) return;
    await navigator.clipboard.writeText(naddr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <li className="rounded-xl border border-ink-800 bg-ink-900/40 p-5 transition hover:border-ink-600">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink-100">
              {p.name ?? <em className="text-ink-400">sin título</em>}
            </h3>
            {p.rail && <RailBadge rail={p.rail} />}
          </div>
          {p.description && (
            <p className="mt-1 text-sm text-ink-300">{p.description}</p>
          )}
          <p className="mt-2 text-sm">
            <span className="font-mono text-bolt-500">
              {p.amountSat != null ? p.amountSat.toLocaleString("es-AR") : "?"} sat
            </span>
            <span className="text-ink-400"> · {intervalLabel(p.interval)}</span>
            {p.slug && (
              <span className="text-ink-400"> · slug <code className="font-mono">{p.slug}</code></span>
            )}
          </p>
          {p.lud16 && (
            <p className="mt-1 text-xs text-ink-400">
              recibe en <code className="font-mono text-ink-200">{p.lud16}</code>
            </p>
          )}
        </div>
        {naddr && (
          <button
            type="button"
            onClick={copy}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-ink-700 px-3 py-1.5 text-xs text-ink-200 transition hover:border-bolt-500 hover:bg-ink-800"
          >
            {copied ? "copiado!" : "copiar naddr"}
          </button>
        )}
      </div>
      {naddr && (
        <code className="mt-3 block truncate rounded bg-ink-950/60 p-2 text-[10px] text-ink-400">
          {naddr}
        </code>
      )}
    </li>
  );
}

function RailBadge({ rail }: { rail: NonNullable<ParsedPlan["rail"]> }) {
  const tone =
    rail === "self"
      ? "border-bolt-500/40 text-bolt-500"
      : "border-emerald-500/40 text-emerald-400";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${tone}`}
    >
      {rail}
    </span>
  );
}

function intervalLabel(i: ParsedPlan["interval"]) {
  switch (i) {
    case "weekly": return "semanal";
    case "monthly": return "mensual";
    case "quarterly": return "trimestral";
    case "yearly": return "anual";
    default: return "?";
  }
}
