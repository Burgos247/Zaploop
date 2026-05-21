"use client";

import { useEffect, useMemo, useState } from "react";
import NDK, { NDKEvent, type NDKKind } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import {
  SUBSCRIPTION_EVENT_KIND,
  SUBSCRIPTION_TAG,
  parseSubscriptionEvent,
  buildCancelEventTemplate,
  type ParsedSubscription,
} from "@/lib/nostr/sub-event";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://purplepag.es",
];

type Loaded = { id: string; dTag: string; parsed: ParsedSubscription };
type Status = "connecting" | "loading" | "ready" | "error";

export function MySubscriptions({ subscriberPubkey }: { subscriberPubkey: string }) {
  const [byKey, setByKey] = useState<Map<string, Loaded>>(new Map());
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

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
            authors: [subscriberPubkey],
            "#t": [SUBSCRIPTION_TAG],
          },
          { closeOnEose: false },
        );
        sub.on("event", (evt) => {
          const d = evt.tags.find((t) => t[0] === "d")?.[1];
          if (!d) return;
          setByKey((prev) => {
            const existing = prev.get(d);
            if (existing && existing.parsed.createdAt >= (evt.created_at ?? 0))
              return prev;
            const next = new Map(prev);
            next.set(d, {
              id: evt.id ?? "",
              dTag: d,
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
  }, [subscriberPubkey]);

  async function onCancel(loaded: Loaded) {
    setCancelError(null);
    if (!loaded.parsed.merchantPubkey || !loaded.parsed.planNaddr) {
      setCancelError("este sub no tiene merchant o plan — no puedo cancelar");
      return;
    }
    if (!window.nostr) {
      setCancelError("necesitás tu identidad Nostr (conectate de nuevo desde el inicio)");
      return;
    }
    setCancelingId(loaded.id);
    try {
      const template = buildCancelEventTemplate({
        subscriberPubkey,
        merchantPubkey: loaded.parsed.merchantPubkey,
        planNaddr: loaded.parsed.planNaddr,
      });
      const signed = await window.nostr.signEvent(template);
      const ndk = new NDK({ explicitRelayUrls: DEFAULT_RELAYS });
      await ndk.connect(3000);
      const accepted = await new NDKEvent(ndk, signed).publish(undefined, 5000);
      if (accepted.size === 0) {
        setCancelError("ningún relay aceptó la cancelación — reintentá");
        return;
      }
      // Optimistic local update — replaceable will arrive via subscription too.
      setByKey((prev) => {
        const next = new Map(prev);
        const cur = next.get(loaded.dTag);
        if (cur) {
          next.set(loaded.dTag, {
            ...cur,
            parsed: { ...cur.parsed, state: "canceled" },
          });
        }
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "no pude cancelar";
      setCancelError(/reject|deny|cancel/i.test(msg) ? "rechazado en la wallet" : msg);
    } finally {
      setCancelingId(null);
    }
  }

  const subs = useMemo(
    () =>
      Array.from(byKey.values()).sort(
        (a, b) => b.parsed.createdAt - a.parsed.createdAt,
      ),
    [byKey],
  );

  const now = Math.floor(Date.now() / 1000);
  const activeCount = subs.filter(
    (s) => s.parsed.state === "active" && (s.parsed.expiresAt ?? 0) > now,
  ).length;

  return (
    <section className="mt-10">
      <div className="flex items-end justify-between">
        <span className="text-xs uppercase tracking-wider text-ink-400">
          {status === "connecting" && "conectando a relays…"}
          {status === "loading" && "leyendo eventos…"}
          {status === "ready" && (
            <>
              {activeCount} activ{activeCount === 1 ? "a" : "as"} ·{" "}
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

      {cancelError && (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
          {cancelError}
        </p>
      )}

      {status === "ready" && subs.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-ink-700 bg-ink-900/30 p-6 text-sm text-ink-300">
          Todavía no te suscribiste a ningún plan. Cuando lo hagas, va a
          aparecer acá.
        </p>
      )}

      {subs.length > 0 && (
        <ul className="mt-4 space-y-3">
          {subs.map((s) => (
            <SubCard
              key={s.dTag}
              loaded={s}
              now={now}
              busy={cancelingId === s.id}
              onCancel={() => onCancel(s)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SubCard({
  loaded,
  now,
  busy,
  onCancel,
}: {
  loaded: Loaded;
  now: number;
  busy: boolean;
  onCancel: () => void;
}) {
  const p = loaded.parsed;
  const expired = (p.expiresAt ?? 0) <= now;
  const isCanceled = p.state === "canceled";
  const isActive = !isCanceled && !expired;

  const merchantNpub = p.merchantPubkey ? nip19.npubEncode(p.merchantPubkey) : null;
  const merchantShort = merchantNpub
    ? `${merchantNpub.slice(0, 12)}…${merchantNpub.slice(-6)}`
    : "?";

  return (
    <li className="rounded-xl border border-ink-800 bg-ink-900/40 p-5 transition hover:border-ink-600">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink-100">
              {p.planSlug ?? <em className="text-ink-400">plan sin slug</em>}
            </h3>
            <StatusBadge canceled={isCanceled} active={isActive} />
          </div>
          <p className="mt-1 text-xs text-ink-300">
            del comercio <code className="font-mono">{merchantShort}</code>
          </p>
          <p className="mt-2 text-sm">
            <span className="font-mono text-bolt-500">
              {p.amountSat?.toLocaleString("es-AR") ?? "?"}
            </span>{" "}
            <span className="text-ink-300">sat / {p.interval ?? "?"}</span>
          </p>
          {p.expiresAt != null && (
            <p className="mt-1 text-xs text-ink-400">
              {isCanceled
                ? "cancelada"
                : expired
                  ? `venció el ${new Date(p.expiresAt * 1000).toLocaleDateString("es-AR")}`
                  : `vence el ${new Date(p.expiresAt * 1000).toLocaleDateString("es-AR")}`}
            </p>
          )}
        </div>

        {!isCanceled && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="shrink-0 rounded-full border border-ink-700 px-3 py-1.5 text-xs text-ink-200 transition hover:border-red-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
          >
            {busy ? "cancelando…" : "Cancelar"}
          </button>
        )}
      </div>
    </li>
  );
}

function StatusBadge({ canceled, active }: { canceled: boolean; active: boolean }) {
  if (canceled)
    return (
      <span className="rounded-full border border-ink-700 bg-ink-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-300">
        cancelada
      </span>
    );
  if (active)
    return (
      <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
        activa
      </span>
    );
  return (
    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">
      vencida
    </span>
  );
}
