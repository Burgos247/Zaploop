import Link from "next/link";

export default function PlanNotFound() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-ink-800">
        <div className="mx-auto max-w-3xl px-6 py-5 text-sm">
          <Link href="/" className="text-ink-300 transition hover:text-ink-100">
            zaploop
          </Link>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-400">
          Plan no encontrado
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-100 sm:text-4xl">
          No pudimos cargar este plan
        </h1>
        <p className="mt-4 text-ink-300">
          El <code className="rounded bg-ink-800 px-1.5 py-0.5 text-xs">naddr</code> que
          recibimos puede estar malformado, o ningún relay tiene el evento
          todavía. Probá de nuevo en unos segundos, o pedile al comercio que
          republiquee el plan.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-ink-700 px-5 py-2.5 text-sm text-ink-100 transition hover:border-ink-500 hover:bg-ink-800"
        >
          Volver a Zaploop
        </Link>
      </section>
    </main>
  );
}
