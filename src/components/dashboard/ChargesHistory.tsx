"use client";

import { useEffect, useMemo, useState } from "react";
import NDK, { type NDKEvent, type NDKKind } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import {
  CHARGE_EVENT_KIND,
  CHARGE_TAG,
  parseChargeEvent,
  type ParsedCharge,
} from "@/lib/nostr/charge-event";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://purplepag.es",
];

type Loaded = { id: string; parsed: ParsedCharge };
type Status = "connecting" | "loading" | "ready" | "error";

export function ChargesHistory({ merchantPubkey }: { merchantPubkey: string }) {
  // Dedup by `d` tag — replaceable events, one per (sub, period).
  const [byD, setByD] = useState<Map<string, Loaded>>(new Map());
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
            kinds: [CHARGE_EVENT_KIND as NDKKind],
            "#m": [merchantPubkey],
            "#t": [CHARGE_TAG],
          },
          { closeOnEose: false },
        );
        sub.on("event", (evt: NDKEvent) => {
          const d = evt.tags.find((t) => t[0] === "d")?.[1];
          if (!d) return;
          setByD((prev) => {
            const existing = prev.get(d);
            if (existing && existing.parsed.createdAt >= (evt.created_at ?? 0))
              return prev;
            const next = new Map(prev);
            next.set(d, {
              id: evt.id ?? "",
              parsed: parseChargeEvent({
                kind: evt.kind!,
                pubkey: evt.pubkey,
                tags: evt.tags,
                content: evt.content,
                created_at: evt.created_at!,
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
    };
  }, [merchantPubkey]);

  const charges = useMemo(
    () =>
      Array.from(byD.values()).sort(
        (a, b) => b.parsed.createdAt - a.parsed.createdAt,
      ),
    [byD],
  );

  const paidCount = charges.filter((c) => c.parsed.state === "paid").length;
  const totalSatsPaid = charges
    .filter((c) => c.parsed.state === "paid")
    .reduce((acc, c) => acc + (c.parsed.amountSat ?? 0), 0);

  return (
    <section className="mt-12">
      <div className="flex items-end justify-between">
        <h2 className="text-xl font-semibold tracking-tight text-ink-100">
          Historial de cobros
        </h2>
        <span className="text-xs text-ink-400">
          {status === "connecting" && "conectando a relays…"}
          {status === "loading" && "leyendo eventos…"}
          {status === "ready" && (
            <>
              {paidCount} cobrado{paidCount === 1 ? "" : "s"} ·{" "}
              <span className="font-mono text-bolt-500">
                {totalSatsPaid.toLocaleString("es-AR")}
              </span>{" "}
              sat total
            </>
          )}
          {status === "error" && "error"}
        </span>
      </div>

      {status === "error" && (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
          {error}
        </p>
      )}

      {status === "ready" && charges.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-ink-700 bg-ink-900/30 p-6 text-sm text-ink-300">
          Todavía no se procesó ningún cobro. Apretá <strong>"Correr ahora"</strong>{" "}
          abajo para disparar el worker contra las suscripciones vencidas.
        </p>
      )}

      {charges.length > 0 && (
        <ul className="mt-4 space-y-2">
          {charges.map((c) => (
            <ChargeRow key={c.id} c={c.parsed} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ChargeRow({ c }: { c: ParsedCharge }) {
  const ts = new Date(c.createdAt * 1000);
  const dateLabel = ts.toLocaleString("es-AR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const subShort = c.subscriberPubkey
    ? `${nip19.npubEncode(c.subscriberPubkey).slice(0, 10)}…`
    : "?";

  const paid = c.state === "paid";
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/40 p-4">
      <span
        className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
          paid
            ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : "border border-red-500/40 bg-red-500/10 text-red-300"
        }`}
      >
        {c.state}
      </span>
      <span className="font-mono text-sm text-bolt-500">
        {c.amountSat?.toLocaleString("es-AR") ?? "?"} sat
      </span>
      <code className="font-mono text-xs text-ink-300">{subShort}</code>
      <span className="text-xs text-ink-400">· {dateLabel}</span>
      {paid && c.preimage && (
        <code
          title={c.preimage}
          className="ml-auto truncate font-mono text-[10px] text-ink-500"
        >
          preimage {c.preimage.slice(0, 12)}…
        </code>
      )}
      {!paid && c.errorMessage && (
        <span className="ml-auto truncate text-xs text-red-400" title={c.errorMessage}>
          {c.errorMessage}
        </span>
      )}
    </li>
  );
}
