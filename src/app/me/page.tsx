import Link from "next/link";
import { redirect } from "next/navigation";
import { nip19 } from "nostr-tools";
import { getSession } from "@/lib/server-session";
import { MySubscriptions } from "@/components/me/MySubscriptions";

export const metadata = { title: "Zaploop — Mis suscripciones" };

export default function MePage() {
  const session = getSession();
  if (!session) redirect("/?login=1");

  const npub = nip19.npubEncode(session.pubkey);

  return (
    <main className="min-h-screen">
      <header className="border-b border-ink-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-5">
          <Link href="/" className="text-sm text-ink-300 transition hover:text-ink-100">
            ← Zaploop
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className="rounded-full border border-ink-700 px-3 py-1.5 text-xs text-ink-100 transition hover:border-bolt-500 hover:bg-ink-800"
            >
              Panel comercio
            </Link>
            <span className="font-mono text-xs text-ink-300">
              {npub.slice(0, 14)}…{npub.slice(-6)}
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-24 pt-12">
        <p className="text-xs uppercase tracking-[0.18em] text-bolt-500">
          Mis suscripciones
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-100 sm:text-4xl">
          Tus pagos recurrentes
        </h1>
        <p className="mt-3 max-w-xl text-ink-300">
          Cada fila es una suscripción que firmaste con tu npub. Si cancelás
          alguna, publicamos un evento de reemplazo en relays y el worker deja
          de cobrarla en el próximo ciclo.
        </p>

        <MySubscriptions subscriberPubkey={session.pubkey} />
      </section>
    </main>
  );
}
