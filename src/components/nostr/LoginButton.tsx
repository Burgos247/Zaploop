"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { nip19 } from "nostr-tools";
import { AUTH_EVENT_KIND } from "@/lib/nostr/auth-shared";
import {
  clearLocalIdentity,
  generateLocalIdentity,
  hasLocalIdentity,
  restoreLocalSigner,
} from "@/lib/nostr/local-signer";

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
  const [hasLocal, setHasLocal] = useState(false);
  const [, startTransition] = useTransition();
  const mountedRef = useRef(true);

  useEffect(() => {
    setHasLocal(hasLocalIdentity());
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function login() {
    setState({ kind: "loading" });
    if (typeof window === "undefined") return;

    // Restore the localStorage-backed shim if a previous identity exists
    // and the extension didn't run first.
    if (!window.nostr) restoreLocalSigner();

    if (!window.nostr) {
      setState({ kind: "no_extension" });
      return;
    }

    await doSignAndPost();
  }

  async function doSignAndPost() {
    try {
      const pk = await window.nostr!.getPublicKey();
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
      const signed = await window.nostr!.signEvent(unsigned);
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
      setHasLocal(hasLocalIdentity());
      setState({ kind: "idle" });
      startTransition(() => router.refresh());
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : "unexpected error";
      setState({
        kind: "error",
        message: /rejected|denied|cancel/i.test(msg) ? "rechazado en la wallet" : msg,
      });
    }
  }

  async function generateAndLogin() {
    setState({ kind: "loading" });
    try {
      generateLocalIdentity();
      setHasLocal(true);
      await doSignAndPost();
    } catch (err) {
      if (!mountedRef.current) return;
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "no pude generar la identidad",
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

  function forgetLocalIdentity() {
    clearLocalIdentity();
    setHasLocal(false);
    // Page reload is the cleanest way to drop the shimmed window.nostr.
    window.location.reload();
  }

  if (pubkey) {
    const npub = nip19.npubEncode(pubkey);
    const short = `${npub.slice(0, 10)}…${npub.slice(-4)}`;
    return (
      <div className="flex items-center gap-2">
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
        {hasLocal && (
          <button
            type="button"
            onClick={forgetLocalIdentity}
            title="Borra el nsec local de este browser. Operación irreversible."
            className="text-[10px] uppercase tracking-wider text-ink-500 transition hover:text-red-400"
          >
            olvidar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={login}
        disabled={state.kind === "loading"}
        className="inline-flex items-center gap-2 rounded-full bg-bolt-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-bolt-400 disabled:opacity-50"
      >
        {state.kind === "loading" ? "Conectando…" : "Conectar Nostr"}
      </button>
      {state.kind === "no_extension" && (
        <>
          <button
            type="button"
            onClick={generateAndLogin}
            className="inline-flex items-center gap-2 rounded-full border border-ink-700 px-4 py-2 text-sm text-ink-100 transition hover:border-bolt-500 hover:bg-ink-800"
            title="Genera un nsec efímero en este browser. Pensado para demo — no uses con sats reales."
          >
            Crear identidad de prueba
          </button>
          <a
            href="https://getalby.com/"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-ink-300 underline-offset-2 hover:text-ink-100 hover:underline"
          >
            o instalá Alby
          </a>
        </>
      )}
      {state.kind === "error" && (
        <span className="text-xs text-red-400">{state.message}</span>
      )}
    </div>
  );
}
