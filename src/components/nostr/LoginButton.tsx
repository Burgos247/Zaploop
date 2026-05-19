"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { nip19 } from "nostr-tools";
import { AUTH_EVENT_KIND } from "@/lib/nostr/auth-shared";
import {
  clearLocalIdentity,
  generateLocalIdentity,
  hasLocalIdentity,
  restoreLocalSigner,
} from "@/lib/nostr/local-signer";
import { LoginModal } from "./LoginModal";

type Props = {
  initialPubkey: string | null;
};

export function LoginButton({ initialPubkey }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pubkey, setPubkey] = useState<string | null>(initialPubkey);
  const [hasLocal, setHasLocal] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const mountedRef = useRef(true);

  // Restore the local-signer shim on mount, then sync hasLocal. Also
  // auto-open the modal if the URL has ?login=1 (links from /app etc.
  // redirect there when no session).
  useEffect(() => {
    if (typeof window !== "undefined" && !window.nostr) restoreLocalSigner();
    setHasLocal(hasLocalIdentity());
    if (!initialPubkey && searchParams?.get("login") === "1") {
      setModalOpen(true);
    }
    return () => {
      mountedRef.current = false;
    };
  }, [initialPubkey, searchParams]);

  function openModal() {
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (loading) return;
    setModalOpen(false);
    setError(null);
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
        const { error: msg } = await res.json().catch(() => ({ error: "login failed" }));
        throw new Error(msg ?? "login failed");
      }
      const { pubkey: confirmedPk } = (await res.json()) as { pubkey: string };
      if (!mountedRef.current) return;
      setPubkey(confirmedPk);
      setHasLocal(hasLocalIdentity());
      setModalOpen(false);
      setError(null);
      startTransition(() => router.refresh());
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : "unexpected error";
      throw new Error(
        /rejected|denied|cancel/i.test(msg) ? "rechazado en la wallet" : msg,
      );
    }
  }

  async function pickExisting() {
    setLoading(true);
    setError(null);
    try {
      if (typeof window === "undefined" || !window.nostr)
        throw new Error("no se detectó una identidad Nostr en este navegador");
      await doSignAndPost();
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "error inesperado");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function pickGenerate() {
    setLoading(true);
    setError(null);
    try {
      generateLocalIdentity();
      setHasLocal(true);
      await doSignAndPost();
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "error inesperado");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    if (!mountedRef.current) return;
    setPubkey(null);
    setLoading(false);
    startTransition(() => router.refresh());
  }

  function forgetLocalIdentity() {
    clearLocalIdentity();
    setHasLocal(false);
    window.location.reload();
  }

  if (pubkey) {
    const npub = nip19.npubEncode(pubkey);
    const short = `${npub.slice(0, 10)}…${npub.slice(-4)}`;
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/app"
          title={`Ir al panel (${npub})`}
          className="inline-flex items-center gap-2 rounded-full border border-ink-700 px-4 py-2 text-xs font-mono text-ink-100 transition hover:border-bolt-500 hover:bg-ink-800"
        >
          <span>{short}</span>
          <span className="text-ink-400">·</span>
          <span className="text-ink-300">panel</span>
        </Link>
        <button
          type="button"
          onClick={logout}
          disabled={loading}
          className="text-[10px] uppercase tracking-wider text-ink-400 transition hover:text-ink-100 disabled:opacity-50"
        >
          salir
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

  const hasExtensionOrLocal =
    typeof window !== "undefined" && !!window.nostr;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-2 rounded-full bg-bolt-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-bolt-400"
      >
        Conectar Nostr
      </button>
      {modalOpen && (
        <LoginModal
          hasExtensionOrLocal={hasExtensionOrLocal}
          loading={loading}
          error={error}
          onPickExisting={pickExisting}
          onPickGenerate={pickGenerate}
          onClose={closeModal}
        />
      )}
    </>
  );
}
