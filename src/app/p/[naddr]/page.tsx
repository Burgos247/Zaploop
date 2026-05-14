import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import NDK from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import { DEFAULT_RELAYS } from "@/lib/nostr/ndk";
import {
  PLAN_EVENT_KIND,
  parsePlanEvent,
  type PlanEventInput,
} from "@/lib/nostr/plan-event";
import { getSession } from "@/lib/server-session";
import { LoginButton } from "@/components/nostr/LoginButton";
import { SubscribeForm } from "@/components/plan/SubscribeForm";

type Props = { params: { naddr: string } };

// Re-fetched at most every 5 min — replaceable events do change.
export const revalidate = 300;

type FetchedPlan = {
  parsed: ReturnType<typeof parsePlanEvent>;
  created_at: number;
};

const loadPlan = cache(async (naddr: string): Promise<FetchedPlan | null> => {
  let decoded;
  try {
    decoded = nip19.decode(naddr);
  } catch {
    return null;
  }
  if (decoded.type !== "naddr") return null;
  const addr = decoded.data;
  if (addr.kind !== PLAN_EVENT_KIND) return null;

  const ndk = new NDK({
    explicitRelayUrls: addr.relays?.length
      ? [...addr.relays, ...DEFAULT_RELAYS]
      : [...DEFAULT_RELAYS],
  });

  try {
    await ndk.connect(3000);
  } catch {
    return null;
  }

  const fetched = await Promise.race([
    ndk.fetchEvent(naddr),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ]);
  if (!fetched) return null;
  if (fetched.kind !== PLAN_EVENT_KIND) return null;

  return {
    parsed: parsePlanEvent({
      kind: fetched.kind!,
      pubkey: fetched.pubkey,
      tags: fetched.tags,
    }),
    created_at: fetched.created_at ?? 0,
  };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const plan = await loadPlan(params.naddr);
  if (!plan?.parsed.name) return { title: "Plan no encontrado · Zaploop" };
  const { name, amountSat, interval, description } = plan.parsed;
  const tagline = `${amountSat?.toLocaleString("es-AR") ?? "?"} sats · ${intervalLabel(interval)}`;
  return {
    title: `${name} · Zaploop`,
    description: description ?? tagline,
    openGraph: {
      title: `${name} — ${tagline}`,
      description: description ?? "Suscripción recurrente en Bitcoin (Lightning).",
      type: "website",
    },
  };
}

export default async function PlanPage({ params }: Props) {
  const [plan, session] = [await loadPlan(params.naddr), getSession()];
  if (!plan?.parsed.name) notFound();

  const p = plan.parsed;
  const npub = nip19.npubEncode(p.pubkey);

  function SubscribeBox({
    planNaddr,
    interval,
  }: {
    planNaddr: string;
    interval: PlanEventInput["interval"] | undefined;
  }) {
    return (
      <div className="mt-12 rounded-2xl border border-ink-800 bg-ink-900/40 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-ink-100">Suscribirme</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-300">
          Vas a autorizar tu wallet Lightning vía Nostr Wallet Connect. El
          primer cobro corre al instante; los siguientes se disparan solos
          cada {intervalLabel(interval)} hasta que canceles.
        </p>
        <div className="mt-5">
          {session ? (
            <SubscribeForm planNaddr={planNaddr} />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <LoginButton initialPubkey={null} />
              <span className="text-xs text-ink-400">
                Necesitamos tu npub para asociarte a la suscripción.
              </span>
            </div>
          )}
        </div>
        <p className="mt-4 text-xs text-ink-400">
          El comercio recibe los pagos directo a su wallet o a su cuenta
          Wapupay. Zaploop no custodia tus fondos.
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-ink-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5 text-sm">
          <Link href="/" className="text-ink-300 transition hover:text-ink-100">
            zaploop
          </Link>
          <span className="font-mono text-xs text-ink-400">
            por {npub.slice(0, 12)}…{npub.slice(-6)}
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-16 pt-16">
        <div className="flex flex-wrap items-center gap-3">
          {p.rail && <RailPill rail={p.rail} />}
          <span className="text-xs uppercase tracking-[0.18em] text-ink-400">
            Plan de suscripción
          </span>
        </div>
        <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-ink-100 sm:text-5xl">
          {p.name}
        </h1>
        {p.description && (
          <p className="mt-4 max-w-2xl text-pretty text-lg text-ink-300">
            {p.description}
          </p>
        )}

        <dl className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Fact label="Monto">
            <span className="font-mono text-bolt-500">
              {p.amountSat?.toLocaleString("es-AR") ?? "?"}
            </span>{" "}
            <span className="text-ink-300">sats</span>
          </Fact>
          <Fact label="Frecuencia">{intervalLabel(p.interval)}</Fact>
          <Fact label="Cobro">{p.rail === "wapupay" ? "Wapupay (ARS)" : "Lightning directo"}</Fact>
        </dl>

        <SubscribeBox planNaddr={params.naddr} interval={p.interval} />

        <p className="mt-10 text-xs text-ink-400">
          Plan publicado en relays Nostr (kind {PLAN_EVENT_KIND}). Si el
          comercio edita el monto, esta página refleja la versión nueva — los
          cobros activos se mantienen al precio original.
        </p>
      </section>
    </main>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
      <dt className="text-xs uppercase tracking-wider text-ink-400">{label}</dt>
      <dd className="mt-2 text-base text-ink-100">{children}</dd>
    </div>
  );
}

function RailPill({ rail }: { rail: NonNullable<PlanEventInput["rail"]> }) {
  const tone =
    rail === "self"
      ? "border-bolt-500/40 text-bolt-500 bg-bolt-500/5"
      : "border-emerald-500/40 text-emerald-400 bg-emerald-500/5";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider ${tone}`}>
      {rail === "self" ? "Sats al wallet" : "ARS al banco"}
    </span>
  );
}

function intervalLabel(i: PlanEventInput["interval"] | undefined) {
  switch (i) {
    case "weekly": return "semanal";
    case "monthly": return "mensual";
    case "quarterly": return "trimestral";
    case "yearly": return "anual";
    default: return "?";
  }
}
