"use client";

import { useEffect } from "react";

type Props = {
  hasExtensionOrLocal: boolean;
  loading: boolean;
  error: string | null;
  onPickExisting: () => void;
  onPickGenerate: () => void;
  onClose: () => void;
};

export function LoginModal({
  hasExtensionOrLocal,
  loading,
  error,
  onPickExisting,
  onPickGenerate,
  onClose,
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [loading, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!loading) onClose();
      }}
      role="dialog"
      aria-modal
      aria-labelledby="login-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-6 shadow-2xl sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-bolt-500">
              Acceso
            </p>
            <h2
              id="login-modal-title"
              className="mt-1 text-xl font-semibold text-ink-100"
            >
              Conectarte con Nostr
            </h2>
            <p className="mt-2 text-sm text-ink-300">
              Tu npub es tu cuenta. No hay password, no hay email.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Cerrar"
            className="text-ink-400 transition hover:text-ink-100 disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <OptionButton
            primary={hasExtensionOrLocal}
            disabled={!hasExtensionOrLocal || loading}
            onClick={onPickExisting}
            title="Conectar con mi identidad"
            subtitle="Tu extensión NIP-07 (Alby, nos2x) o el nsec que ya generaste en este browser."
            badge={hasExtensionOrLocal ? "detectada" : "no detectada"}
          />
          <OptionButton
            primary={!hasExtensionOrLocal}
            disabled={loading}
            onClick={onPickGenerate}
            title="Crear identidad de prueba"
            subtitle="Generamos un nsec efímero en este browser. Para demo — no uses con sats reales."
          />
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {!hasExtensionOrLocal && (
          <p className="mt-5 text-xs text-ink-400">
            ¿Tenés un nsec en otro lado? Instalá{" "}
            <a
              href="https://getalby.com/"
              target="_blank"
              rel="noreferrer"
              className="text-ink-200 underline-offset-2 hover:underline"
            >
              Alby
            </a>{" "}
            y volvés a esta pantalla.
          </p>
        )}
      </div>
    </div>
  );
}

function OptionButton({
  primary,
  disabled,
  onClick,
  title,
  subtitle,
  badge,
}: {
  primary: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  const base =
    "block w-full rounded-xl border p-4 text-left transition disabled:opacity-40 disabled:cursor-not-allowed";
  const tone = primary
    ? "border-bolt-500/60 bg-bolt-500/5 hover:bg-bolt-500/10 hover:border-bolt-500"
    : "border-ink-700 bg-ink-950/40 hover:border-ink-500 hover:bg-ink-800/50";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <span
          className={`text-sm font-semibold ${primary ? "text-bolt-400" : "text-ink-100"}`}
        >
          {title}
        </span>
        {badge && (
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
              primary
                ? "border-bolt-500/50 text-bolt-400"
                : "border-ink-700 text-ink-400"
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-ink-300">{subtitle}</p>
    </button>
  );
}
