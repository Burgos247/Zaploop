"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { nip19 } from "nostr-tools";
import { AUTH_EVENT_KIND } from "@/lib/nostr/auth-shared";

type Props = {
  initialPubkey: string | null;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "no_extension" }
  | { kind: "error"; message: string };

export function LoginButton({ initialPubkey }: Props) {
  const router = useRouter();
  const [pubkey, setPubkey] = useState<string | null>(initialPubkey);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [, startTransition] = useTransition();
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  async function login() {
    setState({ kind: "loading" });
    if (typeof window === "undefined" || !window.nostr) {
      setState({ kind: "no_extension" });
      return;
    }

    try {
      const pk = await window.nostr.getPublicKey();
      const unsigned = {
        kind: AUTH_EVENT_KIND,
        pubkey: pk,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["u", window.location.origin],
          ["method", "POST"],
        ],
        content: "",
      };
      const signed = await window.nostr.signEvent(unsigned);
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(signed),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "login failed" }));
        if (!mountedRef.current) return;
        setState({ kind: "error", message: error ?? "login failed" });
        return;
      }
      const { pubkey: confirmedPk } = (await res.json()) as { pubkey: string };
      if (!mountedRef.current) return;
      setPubkey(confirmedPk);
      setState({ kind: "idle" });
      startTransition(() => router.refresh());
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : "unexpected error";
      // User rejecting NIP-07 prompt throws — normalize the copy.
      setState({
        kind: "error",
        message: /rejected|denied|cancel/i.test(msg) ? "rechazado en la wallet" : msg,
      });
    }
  }

  async function logout() {
    setState({ kind: "loading" });
    await fetch("/api/auth/logout", { method: "POST" });
    if (!mountedRef.current) return;
    setPubkey(null);
    setState({ kind: "idle" });
    startTransition(() => router.refresh());
  }

  if (pubkey) {
    const npub = nip19.npubEncode(pubkey);
    const short = `${npub.slice(0, 10)}…${npub.slice(-4)}`;
    return (
      <button
        type="button"
        onClick={logout}
        title={`Salir (${npub})`}
        disabled={state.kind === "loading"}
        className="inline-flex items-center gap-2 rounded-full border border-ink-700 px-4 py-2 text-xs font-mono text-ink-100 transition hover:border-bolt-500 hover:bg-ink-800 disabled:opacity-50"
      >
        {short}
        <span className="text-ink-400">·</span>
        <span className="text-ink-300">salir</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={login}
        disabled={state.kind === "loading"}
        className="inline-flex items-center gap-2 rounded-full bg-bolt-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-bolt-400 disabled:opacity-50"
      >
        {state.kind === "loading" ? "Conectando…" : "Conectar Nostr"}
      </button>
      {state.kind === "no_extension" && (
        <a
          href="https://getalby.com/"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-ink-300 underline-offset-2 hover:text-ink-100 hover:underline"
        >
          instalá Alby
        </a>
      )}
      {state.kind === "error" && (
        <span className="text-xs text-red-400">{state.message}</span>
      )}
    </div>
  );
}
