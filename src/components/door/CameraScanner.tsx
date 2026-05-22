"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  onScan: (raw: string) => void;
  onClose: () => void;
};

type State = "loading" | "scanning" | "denied" | { kind: "error"; message: string };

// Camera-based QR reader. Uses nimiq's qr-scanner (works on Safari iOS,
// Chrome, Firefox). Lazy-imports the lib only when this component
// mounts so the main bundle stays light.
export function CameraScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<unknown>(null);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const { default: QrScanner } = await import("qr-scanner");
        if (cancelled || !videoRef.current) return;

        const scanner = new QrScanner(
          videoRef.current,
          (result) => {
            if (cancelled) return;
            const cleaned = cleanResult(result.data);
            if (cleaned) onScan(cleaned);
          },
          {
            highlightScanRegion: true,
            highlightCodeOutline: true,
            preferredCamera: "environment",
            returnDetailedScanResult: true,
          },
        );
        scannerRef.current = scanner;

        try {
          await scanner.start();
          if (!cancelled) setState("scanning");
        } catch (err) {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : String(err);
          if (/permission|denied|notallowed/i.test(msg)) {
            setState("denied");
          } else {
            setState({ kind: "error", message: msg });
          }
        }

        cleanup = () => {
          scanner.stop();
          scanner.destroy();
        };
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "no se pudo cargar el scanner",
        });
      }
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [onScan]);

  // ESC to close, body scroll lock.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-bolt-500">
              Escanear
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink-100">
              Apuntá al QR del subscriber
            </h2>
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

        <div className="relative mt-4 aspect-square overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
          />
          {state === "loading" && (
            <Overlay>Activando la cámara…</Overlay>
          )}
          {state === "denied" && (
            <Overlay>
              Permiso denegado. Pegá el npub manual, o cambiá los permisos del
              sitio en tu browser y reintentá.
            </Overlay>
          )}
          {typeof state === "object" && state.kind === "error" && (
            <Overlay>{state.message}</Overlay>
          )}
        </div>

        <p className="mt-4 text-xs text-ink-400">
          Soporta QR con npub directo, `nostr:npub…` o el hex de 64 chars.
        </p>
      </div>
    </div>,
    document.body,
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center text-sm text-ink-200">
      {children}
    </div>
  );
}

function cleanResult(raw: string): string | null {
  const trimmed = raw.trim();
  // Strip nostr: scheme if present.
  const withoutScheme = trimmed.replace(/^nostr:/i, "");
  // Reject URLs (someone scanned a plan page or other link).
  if (/^https?:\/\//i.test(withoutScheme)) {
    // Try to extract npub from path if it's a nostr.com / iris / etc URL.
    const m = withoutScheme.match(/(npub1[a-z0-9]{20,})/i);
    return m ? m[1] : null;
  }
  return withoutScheme;
}
