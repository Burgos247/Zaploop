"use client";

import { useState } from "react";
import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";
import { addInterval } from "@/lib/billing/interval";
import {
  buildSubscriptionEventTemplate,
  type SubscriptionEventInput,
} from "@/lib/nostr/sub-event";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://purplepag.es",
];

type Props = {
  planNaddr: string;
  planSlug: string;
  merchantPubkey: string;
  amountSat: number;
  interval: SubscriptionEventInput["interval"];
  rail: SubscriptionEventInput["rail"];
};

type State =
  | { kind: "idle" }
  | { kind: "encrypting" }
  | { kind: "signing" }
  | { kind: "publishing" }
  | { kind: "done"; acceptedRelays: string[]; expiresAt: number }
  | { kind: "error"; message: string };

const NWC_RE = /^nostr\+walletconnect:\/\//i;

export function SubscribeForm({
  planNaddr,
  planSlug,
  merchantPubkey,
  amountSat,
  interval,
  rail,
}: Props) {
  const [nwcUri, setNwcUri] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const serverPubkey = process.env.NEXT_PUBLIC_ZAPLOOP_SERVER_PUBKEY;
    if (!serverPubkey)
      return setState({
        kind: "error",
        message: "configuración: falta NEXT_PUBLIC_ZAPLOOP_SERVER_PUBKEY",
      });

    if (!window.nostr)
      return setState({
        kind: "error",
        message: "necesitás una extensión Nostr (NIP-07)",
      });
    if (!window.nostr.nip44)
      return setState({
        kind: "error",
        message: "tu extensión Nostr no soporta NIP-44 — actualizá Alby a una versión reciente",
      });
    if (!NWC_RE.test(nwcUri.trim()))
      return setState({
        kind: "error",
        message: "el URI debe empezar con nostr+walletconnect://",
      });

    try {
      setState({ kind: "encrypting" });
      const subscriberPubkey = await window.nostr.getPublicKey();
      const ciphertext = await window.nostr.nip44.encrypt(
        serverPubkey,
        nwcUri.trim(),
      );

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = addInterval(now, interval);
      const template = buildSubscriptionEventTemplate(
        {
          subscriberPubkey,
          merchantPubkey,
          planNaddr,
          planSlug,
          amountSat,
          interval,
          rail,
          expiresAt,
          nwcCiphertext: ciphertext,
        },
        now,
      );

      setState({ kind: "signing" });
      const signed = await window.nostr.signEvent(template);

      setState({ kind: "publishing" });
      const ndk = new NDK({ explicitRelayUrls: DEFAULT_RELAYS });
      await ndk.connect(3000);
      const ndkEvent = new NDKEvent(ndk, signed);
      const accepted = await ndkEvent.publish(undefined, 5000);
      const acceptedRelays = Array.from(accepted).map((r) => r.url);
      if (acceptedRelays.length === 0)
        return setState({
          kind: "error",
          message: "ningún relay aceptó el evento",
        });

      setState({ kind: "done", acceptedRelays, expiresAt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error inesperado";
      setState({
        kind: "error",
        message: /reject|deny|cancel/i.test(msg) ? "rechazado en la wallet" : msg,
      });
    }
  }

  if (state.kind === "done") {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <p className="text-sm font-semibold text-emerald-300">
          Suscripción registrada en Nostr
        </p>
        <p className="mt-2 text-xs text-ink-300">
          Publicada en {state.acceptedRelays.length} relay
          {state.acceptedRelays.length === 1 ? "" : "s"}. Válida hasta{" "}
          <code className="font-mono">
            {new Date(state.expiresAt * 1000).toLocaleString("es-AR")}
          </code>
          .
        </p>
        <p className="mt-2 text-xs text-ink-400">
          El primer cobro corre cuando el worker procese el evento. Por ahora
          Zaploop registra la suscripción pero no mueve sats — esa pieza se
          activa con el worker recurrente.
        </p>
      </div>
    );
  }

  const busy =
    state.kind === "encrypting" ||
    state.kind === "signing" ||
    state.kind === "publishing";

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
          monto del plan. Se encripta con NIP-44 en tu propio navegador antes
          de salir — Zaploop nunca ve el texto plano.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-bolt-500 px-6 py-3 text-sm font-semibold text-ink-950 transition hover:bg-bolt-400 disabled:opacity-50"
        >
          {state.kind === "encrypting" && "Encriptando…"}
          {state.kind === "signing" && "Firmando…"}
          {state.kind === "publishing" && "Publicando…"}
          {(state.kind === "idle" || state.kind === "error") && "Suscribirme"}
        </button>
        {state.kind === "error" && (
          <span className="text-xs text-red-400">{state.message}</span>
        )}
      </div>
    </form>
  );
}
