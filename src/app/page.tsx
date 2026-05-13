import { getSession } from "@/lib/server-session";
import { LoginButton } from "@/components/nostr/LoginButton";

export default function Home() {
  const session = getSession();
  return (
    <main className="relative overflow-hidden">
      <BackgroundLayers />
      <Header initialPubkey={session?.pubkey ?? null} />
      <Hero />
      <HowItWorks />
      <Rails />
      <UseCases />
      <Sponsor />
      <Footer />
    </main>
  );
}

function BackgroundLayers() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-radial-fade" aria-hidden />
    </>
  );
}

function Header({ initialPubkey }: { initialPubkey: string | null }) {
  return (
    <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <a href="#" className="flex items-center gap-2 text-ink-100">
        <LogoMark className="h-7 w-7" />
        <span className="text-lg font-semibold tracking-tight">Zaploop</span>
      </a>
      <nav className="flex items-center gap-2 text-sm">
        <a
          href="#como-funciona"
          className="hidden rounded-full px-4 py-2 text-ink-200 transition hover:text-ink-100 sm:inline-flex"
        >
          Demo
        </a>
        <a
          href="https://github.com/Burgos247/Zaploop" target="_blank" rel="noreferrer"
          className="hidden rounded-full border border-ink-700 px-4 py-2 text-ink-100 transition hover:border-ink-500 hover:bg-ink-800 sm:inline-flex"
        >
          GitHub
        </a>
        <LoginButton initialPubkey={initialPubkey} />
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-24">
      <p className="text-sm uppercase tracking-[0.18em] text-bolt-500">
        Para coworks, clubes, gimnasios y cafés
      </p>
      <h1 className="mt-4 max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight text-ink-100 sm:text-6xl md:text-7xl">
        Cobrá suscripciones en{" "}
        <span className="bg-gradient-to-r from-bolt-400 to-bolt-600 bg-clip-text text-transparent">
          Bitcoin
        </span>{" "}
        sin custodia.
      </h1>
      <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-ink-200">
        Membresías mensuales por Lightning. Tus clientes pagan con su wallet,
        vos recibís sats directo o pesos en tu cuenta. Sin Stripe, sin
        chargebacks, sin tarjetas.
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <a
          href="#como-funciona"
          className="inline-flex items-center gap-2 rounded-full bg-bolt-500 px-6 py-3 text-sm font-semibold text-ink-950 transition hover:bg-bolt-400"
        >
          Ver demo
          <ArrowIcon className="h-4 w-4" />
        </a>
        <a
          href="https://github.com/Burgos247/Zaploop" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-ink-700 px-6 py-3 text-sm font-semibold text-ink-100 transition hover:border-ink-500 hover:bg-ink-800"
        >
          <GithubIcon className="h-4 w-4" />
          Ver en GitHub
        </a>
      </div>

      <dl className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Comisión de plataforma" value="0%" hint="durante el hackathon" />
        <Stat label="Tiempo de setup" value="< 5 min" hint="de cero a primer plan" />
        <Stat label="Custodia de fondos" value="Ninguna" hint="los sats no pasan por nosotros" />
      </dl>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900/50 p-5 backdrop-blur">
      <dt className="text-xs uppercase tracking-wider text-ink-300">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold text-ink-100">{value}</dd>
      <p className="mt-1 text-xs text-ink-400">{hint}</p>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Creá tu plan",
      body: "Nombre, monto en sats y frecuencia. Listo en menos de un minuto. Compartilo como link público o QR.",
    },
    {
      n: "02",
      title: "Tu cliente se suscribe con Nostr",
      body: "Inicia sesión con su npub, autoriza una wallet con Nostr Wallet Connect (NWC) y queda activado al instante.",
    },
    {
      n: "03",
      title: "Cobramos solos cada mes",
      body: "El sistema dispara el pago vía NWC en la fecha pactada. Vos recibís webhook y el cliente, su badge NIP-58.",
    },
  ];
  return (
    <section id="como-funciona" className="relative z-10 mx-auto max-w-6xl px-6 py-24 scroll-mt-16">
      <SectionEyebrow>Cómo funciona</SectionEyebrow>
      <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-ink-100 sm:text-4xl">
        Tres pasos. Después se cobra solo.
      </h2>
      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        {steps.map((s) => (
          <div
            key={s.n}
            className="group relative rounded-2xl border border-ink-800 bg-ink-900/40 p-6 transition hover:border-ink-600 hover:bg-ink-900"
          >
            <span className="font-mono text-sm text-bolt-500">{s.n}</span>
            <h3 className="mt-4 text-xl font-semibold text-ink-100">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Rails() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-24">
      <SectionEyebrow>Dos formas de recibir</SectionEyebrow>
      <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-ink-100 sm:text-4xl">
        Vos elegís cómo aterrizan los pagos.
      </h2>
      <p className="mt-4 max-w-2xl text-ink-300">
        Cambialo plan por plan. Sin migrar nada, sin permisos extra.
      </p>

      <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RailCard
          tone="bolt"
          tag="Carril Self"
          title="Sats directo a tu wallet"
          subtitle="100% no custodial. Ideal si ya operás en Bitcoin."
          points={[
            "Conectás tu wallet con NWC una sola vez (Alby Hub, Mutiny, Phoenix, etc.).",
            "El invoice se genera contra tu nodo, los sats nunca pasan por nosotros.",
            "Confirmación instantánea por preimage.",
          ]}
          example="La Crypta cobra el acceso al cowork de los martes — los sats van directo al wallet del espacio."
          icon={<BoltIcon className="h-6 w-6" />}
        />
        <RailCard
          tone="ars"
          tag="Carril Wapupay"
          title="Pesos en tu cuenta"
          subtitle="Para comercios tradicionales. Sin KYC."
          points={[
            "Conectamos con tu cuenta Wapupay vía API token.",
            "Los sats se convierten al rate del momento y quedan como saldo ARS.",
            "Opcional: transferencia automática a tu CBU/alias después de cada cobro.",
          ]}
          example="Un café de barrio que vende 'club de café' a 30.000 sats por mes y quiere ese monto en pesos al banco."
          icon={<PesoIcon className="h-6 w-6" />}
        />
      </div>
    </section>
  );
}

function RailCard({
  tone,
  tag,
  title,
  subtitle,
  points,
  example,
  icon,
}: {
  tone: "bolt" | "ars";
  tag: string;
  title: string;
  subtitle: string;
  points: string[];
  example: string;
  icon: React.ReactNode;
}) {
  const accent =
    tone === "bolt"
      ? "from-bolt-500/30 to-transparent text-bolt-500"
      : "from-emerald-500/30 to-transparent text-emerald-400";
  return (
    <article className="relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40 p-8">
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent}`} />
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 ${tone === "bolt" ? "text-bolt-500" : "text-emerald-400"}`}>
          {icon}
        </span>
        <span className="text-xs uppercase tracking-wider text-ink-300">{tag}</span>
      </div>
      <h3 className="mt-6 text-2xl font-semibold tracking-tight text-ink-100">
        {title}
      </h3>
      <p className="mt-2 text-ink-300">{subtitle}</p>
      <ul className="mt-6 space-y-3 text-sm text-ink-200">
        {points.map((p) => (
          <li key={p} className="flex gap-3">
            <CheckIcon className={`mt-0.5 h-4 w-4 flex-none ${tone === "bolt" ? "text-bolt-500" : "text-emerald-400"}`} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 rounded-lg border border-ink-800 bg-ink-950/60 p-4 text-sm italic text-ink-300">
        {example}
      </p>
    </article>
  );
}

function UseCases() {
  const cases = [
    { title: "Coworks", body: "Acceso semanal o mensual al espacio. Verificás membresía con el npub en la puerta." },
    { title: "Clubes y asociaciones", body: "Cuota societaria recurrente con badge NIP-58 que prueba membresía activa." },
    { title: "Cafés y comercios", body: "Programas tipo 'café del mes' o consumo recurrente sin pasar por tarjetas." },
    { title: "Gimnasios y academias", body: "Suscripción mensual con corte automático si no se completa el cobro." },
    { title: "Creadores y comunidades", body: "Suscripciones de contenido pagadas en sats, sin intermediarios web2." },
    { title: "Software y SaaS", body: "Planes para apps Nostr-native o cualquier producto que cobre por LN." },
  ];
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-24">
      <SectionEyebrow>Hecho para</SectionEyebrow>
      <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-ink-100 sm:text-4xl">
        Cualquier negocio que cobra todos los meses.
      </h2>
      <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-ink-800 sm:grid-cols-2 lg:grid-cols-3">
        {cases.map((c) => (
          <div key={c.title} className="bg-ink-900 p-6">
            <h3 className="text-base font-semibold text-ink-100">{c.title}</h3>
            <p className="mt-2 text-sm text-ink-300">{c.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Sponsor() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-24">
      <div className="rounded-2xl border border-ink-800 bg-gradient-to-br from-ink-900 to-ink-950 p-8 sm:p-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <p className="text-xs uppercase tracking-wider text-ink-300">
              Integración sponsor
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink-100 sm:text-3xl">
              Sats a pesos en tu banco, sin KYC, gracias a Wapupay.
            </h2>
            <p className="mt-4 text-ink-300">
              Activá el carril Wapupay en un plan y el sistema convierte cada
              cobro al rate del momento y, si querés, lo transfiere a tu CBU o
              alias bancario.
            </p>
          </div>
          <a
            href="https://wapupay.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 self-start rounded-full border border-ink-700 px-5 py-3 text-sm font-semibold text-ink-100 transition hover:border-ink-500 hover:bg-ink-800 sm:self-auto"
          >
            Conocer Wapupay
            <ArrowIcon className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 border-t border-ink-800">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-ink-400 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <LogoMark className="h-5 w-5" />
          <span>Zaploop — proyecto para la Hackatón La Crypta #3 (2026).</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#como-funciona" className="transition hover:text-ink-100">Demo</a>
          <a href="https://github.com/Burgos247/Zaploop" target="_blank" rel="noreferrer" className="transition hover:text-ink-100">GitHub</a>
          <a href="https://wapupay.com" target="_blank" rel="noreferrer" className="transition hover:text-ink-100">
            Wapupay
          </a>
        </div>
      </div>
    </footer>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-[0.2em] text-bolt-500">{children}</p>
  );
}

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M13.5 2.5 5 13h6l-1.5 8.5L18 11h-6l1.5-8.5Z"
        fill="url(#zlg)"
        stroke="#070710"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="zlg" x1="5" y1="2" x2="18" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffd84d" />
          <stop offset="1" stopColor="#e5b400" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M13 2 3 14h7l-1 8 11-14h-7l0-6Z" />
    </svg>
  );
}

function PesoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M8 21V5h4a4 4 0 0 1 0 8H6" />
      <path d="M6 17h10" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 12h14" />
      <path d="m13 5 7 7-7 7" />
    </svg>
  );
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2A10 10 0 0 0 8.84 21.5c.5.09.66-.22.66-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.46-1.11-1.46-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.93.83.09-.65.35-1.1.63-1.35-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.5 9.5 0 0 1 12 6.8a9.5 9.5 0 0 1 2.5.34c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85V21c0 .27.16.58.67.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}
