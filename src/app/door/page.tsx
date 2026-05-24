import Link from "next/link";
import { redirect } from "next/navigation";
import { nip19 } from "nostr-tools";
import { getSession } from "@/lib/server-session";
import { DoorScanner } from "@/components/door/DoorScanner";

export const metadata = { title: "Zaploop — Acceso" };

export default function DoorPage() {
  const session = getSession();
  if (!session) redirect("/?login=1");

  const npub = nip19.npubEncode(session.pubkey);

  return (
    <main className="min-h-screen">
      <header className="border-b border-ink-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 py-5 text-sm">
          <Link href="/" className="text-ink-300 transition hover:text-ink-100">
            ← Zaploop
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className="rounded-full border border-ink-700 px-3 py-1.5 text-xs text-ink-100 transition hover:border-bolt-500 hover:bg-ink-800"
            >
              Panel comercio
            </Link>
            <Link
              href="/me"
              className="rounded-full border border-ink-700 px-3 py-1.5 text-xs text-ink-100 transition hover:border-bolt-500 hover:bg-ink-800"
            >
              Mis suscripciones
            </Link>
            <span className="font-mono text-xs text-ink-400">
              {npub.slice(0, 12)}…{npub.slice(-6)}
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-24 pt-12">
        <p className="text-xs uppercase tracking-[0.18em] text-bolt-500">
          Verificación de membresía
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-100 sm:text-4xl">
          ¿Pasa?
        </h1>
        <p className="mt-3 max-w-xl text-ink-300">
          Pegá el <code className="rounded bg-ink-800 px-1.5 py-0.5 text-xs">npub</code>{" "}
          de la persona en la puerta. Consultamos relays Nostr al toque y te
          mostramos si su suscripción está activa para uno de tus planes.
        </p>

        <div className="mt-10">
          <DoorScanner merchantPubkey={session.pubkey} />
        </div>
      </section>
    </main>
  );
}
