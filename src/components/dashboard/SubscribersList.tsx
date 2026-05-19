"use client";

import { useEffect, useMemo, useState } from "react";
import NDK, { type NDKEvent, type NDKKind } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import {
  SUBSCRIPTION_EVENT_KIND,
  SUBSCRIPTION_TAG,
  parseSubscriptionEvent,
} from "@/lib/nostr/sub-event";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://purplepag.es",
];

type ParsedSub = ReturnType<typeof parseSubscriptionEvent>;

type LoadedSub = {
  id: string;
  parsed: ParsedSub;
};

type Status = "connecting" | "loading" | "ready" | "error";

export function SubscribersList({ merchantPubkey }: { merchantPubkey: string }) {
  // Dedup key: subscriber_pubkey + d-tag (= plan naddr). Replaceable.
  const [byKey, setByKey] = useState<Map<string, LoadedSub>>(new Map());
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
            kinds: [SUBSCRIPTION_EVENT_KIND as NDKKind],
            "#p": [merchantPubkey],
            "#t": [SUBSCRIPTION_TAG],
          },
          { closeOnEose: false },
        );

        sub.on("event", (evt: NDKEvent) => {
          const dTag = evt.tags.find((t) => t[0] === "d")?.[1];
          if (!dTag) return;
          const key = `${evt.pubkey}:${dTag}`;
          setByKey((prev) => {
            const existing = prev.get(key);
            if (existing && existing.parsed.createdAt >= (evt.created_at ?? 0))
              return prev;
            const next = new Map(prev);
            next.set(key, {
              id: evt.id ?? "",
              parsed: parseSubscriptionEvent({
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

  const subs = useMemo(
    () =>
      Array.from(byKey.values()).sort(
        (a, b) => b.parsed.createdAt - a.parsed.createdAt,
      ),
    [byKey],
  );

  const now = Math.floor(Date.now() / 1000);
  const activeCount = subs.filter(
    (s) => s.parsed.expiresAt != null && s.parsed.expiresAt > now,
  ).length;

  return (
    <section className="mt-12">
      <div className="flex items-end justify-between">
        <h2 className="text-xl font-semibold tracking-tight text-ink-100">
          Tus suscriptores
        </h2>
        <span className="text-xs text-ink-400">
          {status === "connecting" && "conectando a relays…"}
          {status === "loading" && "leyendo eventos…"}
          {status === "ready" && (
            <>
              {activeCount} activ{activeCount === 1 ? "o" : "os"} ·{" "}
              {subs.length} en total
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

      {status === "ready" && subs.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-ink-700 bg-ink-900/30 p-6 text-sm text-ink-300">
          Todavía no tenés suscriptores. Compartí el{" "}
          <code className="font-mono text-ink-200">naddr</code> de alguno de tus
          planes — apenas alguien se suscriba aparece acá.
        </p>
      )}

      {subs.length > 0 && (
        <ul className="mt-4 space-y-3">
          {subs.map((s) => (
            <SubscriberCard key={s.parsed.subscriberPubkey + s.parsed.planNaddr} sub={s} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SubscriberCard({ sub, now }: { sub: LoadedSub; now: number }) {
  const npub = nip19.npubEncode(sub.parsed.subscriberPubkey);
  const short = `${npub.slice(0, 12)}…${npub.slice(-6)}`;
  const isActive = sub.parsed.expiresAt != null && sub.parsed.expiresAt > now;
  const expiresLabel = sub.parsed.expiresAt
    ? new Date(sub.parsed.expiresAt * 1000).toLocaleDateString("es-AR", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "?";

  return (
    <li className="rounded-xl border border-ink-800 bg-ink-900/40 p-5 transition hover:border-ink-600">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-sm text-ink-100">{short}</code>
            <StatusBadge active={isActive} />
            {sub.parsed.rail && (
              <span className="text-[10px] uppercase tracking-wider text-ink-400">
                {sub.parsed.rail}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-300">
            plan <code className="font-mono">{sub.parsed.planSlug ?? "?"}</code>
            <span className="text-ink-400"> · </span>
            <span className="font-mono text-bolt-500">
              {sub.parsed.amountSat != null
                ? sub.parsed.amountSat.toLocaleString("es-AR")
                : "?"}
            </span>{" "}
            sat / {sub.parsed.interval ?? "?"}
          </p>
          <p className="mt-1 text-xs text-ink-400">
            {isActive ? "vence" : "venció"} el {expiresLabel}
          </p>
        </div>
      </div>
    </li>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  const tone = active
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
    : "border-ink-700 bg-ink-800 text-ink-400";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${tone}`}
    >
      {active ? "activa" : "vencida"}
    </span>
  );
}
