import Link from "next/link";
import { redirect } from "next/navigation";
import { nip19 } from "nostr-tools";
import { getSession } from "@/lib/server-session";
import { CreatePlanForm } from "@/components/dashboard/CreatePlanForm";
import { PlanList } from "@/components/dashboard/PlanList";
import { RunBillingButton } from "@/components/dashboard/RunBillingButton";

export const metadata = { title: "Zaploop — Panel" };

export default function AppPage() {
  const session = getSession();
  if (!session) redirect("/?login=1");

  const npub = nip19.npubEncode(session.pubkey);

  return (
    <main className="min-h-screen">
      <header className="border-b border-ink-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link href="/" className="text-sm text-ink-300 transition hover:text-ink-100">
            ← Zaploop
          </Link>
          <span className="font-mono text-xs text-ink-300">
            {npub.slice(0, 14)}…{npub.slice(-6)}
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-24 pt-12">
        <p className="text-xs uppercase tracking-[0.18em] text-bolt-500">Panel del merchant</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-100 sm:text-4xl">
          Crear un plan de suscripción
        </h1>
        <p className="mt-3 max-w-xl text-ink-300">
          El plan se firma con tu extensión Nostr y se publica como evento{" "}
          <code className="rounded bg-ink-800 px-1.5 py-0.5 text-xs">kind 30078</code>{" "}
          a los relays default. Replaceable por <code className="rounded bg-ink-800 px-1.5 py-0.5 text-xs">d</code>{" "}
          tag — editar el plan publica una versión nueva sin perder el {""}
          <code className="rounded bg-ink-800 px-1.5 py-0.5 text-xs">naddr</code> compartido.
        </p>

        <div className="mt-10 rounded-2xl border border-ink-800 bg-ink-900/40 p-6 sm:p-8">
          <CreatePlanForm pubkey={session.pubkey} />
        </div>

        <PlanList pubkey={session.pubkey} />
        <RunBillingButton />
      </section>
    </main>
  );
}
