"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";

type Props = {
  url: string;
  planName?: string | null;
  onClose: () => void;
};

export function PlanQrModal({ url, planName, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // Lock background scroll while open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      <div
        className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-bolt-500">
              Escaneá para suscribirte
            </p>
            {planName && (
              <h2 className="mt-1 text-lg font-semibold text-ink-100">{planName}</h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-ink-400 transition hover:text-ink-100"
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

        <div className="mt-6 flex items-center justify-center rounded-xl bg-white p-5">
          <QRCode value={url} size={256} bgColor="#ffffff" fgColor="#070710" />
        </div>

        <div className="mt-4">
          <p className="text-xs text-ink-400">URL del plan</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="block flex-1 truncate rounded-lg border border-ink-800 bg-ink-950/60 p-2 font-mono text-xs text-ink-200">
              {url}
            </code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex shrink-0 items-center rounded-full border border-ink-700 px-3 py-1.5 text-xs text-ink-200 transition hover:border-bolt-500 hover:bg-ink-800"
            >
              {copied ? "copiado!" : "copiar"}
            </button>
          </div>
        </div>

        <p className="mt-4 text-xs text-ink-400">
          Mostrá esta pantalla a quien quiera suscribirse. Apunta con la cámara
          del celular — abre la página pública del plan y completan el flow ahí.
        </p>
      </div>
    </div>
  );
}
