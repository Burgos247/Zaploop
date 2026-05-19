# Zaploop

**Suscripciones recurrentes en Bitcoin Lightning, sin custodia.**

Entrega para la [Dev Hackatón #3 de La Crypta](https://lacrypta.dev) — categoría **COMMERCE**. Multi-tenant: cualquier comercio crea su plan, comparte un link, y Zaploop dispara el cobro recurrente vía NWC. Los sats van directo al wallet del comercio. Nosotros no custodiamos nada.

Live: **[zaploop.vercel.app](https://zaploop.vercel.app)**

---

## Por qué

Stripe Billing existe para tarjetas. Para Lightning todavía no hay equivalente — los cobros recurrentes Nostr-native son el agujero. Zaploop lo llena con tres primitivas:

1. **Identidad** = `npub` (NIP-07 o NIP-46 bunker, con fallback a nsec local generado en el browser).
2. **Cobro** = NWC (NIP-47), el subscriber autoriza una vez con un budget.
3. **Estado** = eventos Nostr replaceable en relays (kinds 30078, 30079, 30080).

No hay base de datos. No hay vendor lock-in. Si Zaploop desaparece mañana, las suscripciones siguen visibles en relays — cualquier otro orchestrator puede continuarlas.

---

## Arquitectura

```
┌────────────┐       publish kind 30078       ┌─────────┐
│  Merchant  │ ───────────────────────────────►  Relays │
│   (NIP-07) │   Plan: amount, interval,        │ Damus,  │
└────┬───────┘   rail, lud16, ...               │ nos.lol,│
     │                                          │ ...     │
     │ shares naddr (or QR)                     └────┬────┘
     ▼                                               │
┌────────────┐       publish kind 30079              │
│ Subscriber │ ─────────────────────────────────────►│
│  (NIP-07)  │   content = NIP-44(NWC URI →          │
└────────────┘             server pubkey)            │
                                                     │
                  ┌─────────────────────────────┐    │
                  │  Worker (Vercel, on-demand) │◄───┘
                  │                             │
                  │  1. Fetch due subs (30079)  │
                  │  2. Decrypt NWC w/ srv nsec │
                  │  3. LUD-16 → bolt11 invoice │
                  │  4. NWC pay_invoice         │
                  │  5. Publish kind 30080      │──► sats land at lud16
                  └─────────────────────────────┘    (merchant's wallet)
```

### Decisiones que vale la pena conocer

- **Nostr-only persistence.** Postgres / Supabase / KV vencieron en una decisión de diseño — la opción está en `supabase/migrations/0001_init.sql` como referencia para el día que necesitemos endurecer la consistencia. Hoy: relays.
- **NIP-44 client-side.** El NWC URI del subscriber se encripta en su browser (`window.nostr.nip44.encrypt`) al pubkey del server. El plaintext nunca toca el backend de Zaploop — sólo el worker, en tiempo de cobro, lo desencripta con la nsec del server.
- **Identidad portátil.** Si el browser del subscriber no tiene Alby, ofrecemos generar un nsec local que vive en `localStorage`. Sirve para demo; deja una nota XSS-warning visible.
- **lud16 como destino universal.** El merchant pone cualquier Lightning Address en su plan. `andy@walletofsatoshi.com` lleva sats al wallet. `cafe@wapu.app` lleva ARS a Wapupay. El worker no se entera de la diferencia — todo es LUD-16.

### Eventos publicados

| Kind | Autor | `d` tag | Propósito | Replaceable |
|------|-------|---------|-----------|-------------|
| 30078 | merchant | plan slug | Definición del plan (NIP-78) | sí |
| 30079 | subscriber | plan naddr | "Estoy suscripto a X". `content` = NIP-44(NWC URI → server pubkey) | sí |
| 30080 | server | `<sub_naddr>:<period>` | Resultado de un cobro. Tags `state` (paid/failed), `amount`, `period`, `valid_until`, `preimage` o `error` | sí |
| 22242 | usuario | — | Auth event (NIP-42-style), 60s window, firma de login a `/api/auth/login` | no |

`#t` namespace: `zaploop:plan`, `zaploop:sub`, `zaploop:charge`.

---

## Probarlo

### En producción

1. Andá a [zaploop.vercel.app](https://zaploop.vercel.app), click **Conectar Nostr**.
2. Si no tenés extensión Nostr, click **Crear identidad de prueba** — genera un nsec local en tu browser.
3. **Panel** → crear un plan con tu Lightning Address (cualquier wallet sirve: Alby, WoS, Phoenix, Wapupay).
4. En el card del plan, click **QR** → mostralo en pantalla. Otro device escanea, cae en `/p/<naddr>`.
5. El otro device se suscribe (pega su NWC URI con budget chico).
6. Tu panel muestra el nuevo suscriptor en vivo.
7. Click **Correr ahora** → el worker decripta el NWC, resuelve la `lud16` con LNURL-pay, dispara `pay_invoice`. Aparece el cobro en *Historial de cobros* con el preimage.
8. **Puerta** (header del panel) → pegá el npub del subscriber → **BIENVENIDO**.

### Local

```bash
git clone https://github.com/Burgos247/Zaploop.git
cd Zaploop
npm install

# Generar los 3 secretos
node scripts/gen-server-keypair.mjs >> .env.local
echo "ZAPLOOP_SESSION_KEY=$(node scripts/gen-session-key.mjs)" >> .env.local
node scripts/gen-cron-secret.mjs >> .env.local

npm run dev
```

Abrí `http://localhost:3000`. Para probar contra la red, las env vars locales tienen que matchear las de Vercel (mismo `ZAPLOOP_SERVER_NSEC`, sino los subscribers de prod no se pueden decriptar).

---

## Stack

- **Next.js 14** App Router, TypeScript, Tailwind. Sin SSG donde había cookies (`/`, `/app`, `/p/[naddr]`, `/door`).
- **NDK** (`@nostr-dev-kit/ndk` ^3) para todo lo Nostr — verificación de firma, publishing, subscriptions live, fetchEvent. Alineado con [`lacrypta/nostr-starter`](https://github.com/lacrypta/nostr-starter).
- **nostr-tools** ^2.7 para NIP-44, nip19, finalizeEvent (especialmente útiles en el local-signer shim y en el worker).
- **@getalby/sdk** para el NWC client del worker (`pay_invoice`).
- **react-qr-code** para el QR de cada plan.
- Sin DB, sin Redis, sin Supabase, sin servicios externos para estado. Sólo relays Nostr.

### Estructura

```
src/
├── app/
│   ├── page.tsx                 # Landing (es-AR, merchants LATAM)
│   ├── app/page.tsx             # Panel del merchant (auth-gated)
│   ├── door/page.tsx            # Scanner de membresía
│   ├── p/[naddr]/page.tsx       # Página pública del plan (con OG)
│   └── api/
│       ├── auth/login,logout    # Sesión Nostr (kind 22242 + cookie HMAC)
│       ├── check                # Verificación de membresía pública
│       └── cron/billing         # Worker — auth Bearer o session
├── components/
│   ├── nostr/                   # LoginButton, SignerBoot
│   ├── dashboard/               # CreatePlanForm, PlanList, PlanQrModal,
│   │                            # SubscribersList, ChargesHistory, RunBillingButton
│   ├── door/                    # DoorScanner
│   └── plan/                    # SubscribeForm
└── lib/
    ├── nostr/                   # ndk, auth, plan-event, sub-event,
    │                            # charge-event, local-signer, server-signer
    ├── lnurl.ts                 # LUD-16 → bolt11
    ├── nwc-pay.ts               # @getalby/sdk wrapper
    ├── billing/interval.ts      # weekly/monthly/quarterly/yearly → seconds
    ├── session.ts               # HMAC cookie
    └── server-session.ts        # getSession() helper para server components
```

---

## Env vars

| Variable | Public | Generador | Para qué |
|----------|--------|-----------|----------|
| `NEXT_PUBLIC_ZAPLOOP_SERVER_PUBKEY` | sí | `scripts/gen-server-keypair.mjs` | El subscriber NIP-44 encripta su NWC URI a este pubkey. |
| `ZAPLOOP_SERVER_NSEC` | **no** | `scripts/gen-server-keypair.mjs` | El worker decripta NWC URIs con esta nsec. Compromiso = todos los subscribers redirigen sus pagos. |
| `ZAPLOOP_SESSION_KEY` | no | `scripts/gen-session-key.mjs` | HMAC para firmar las cookies de sesión. |
| `CRON_SECRET` | no | `scripts/gen-cron-secret.mjs` | Bearer para disparar el worker fuera de una sesión. |

---

## Limitaciones honestas

- **Race condition del worker**: dos disparadas concurrentes podrían cobrar la misma sub dos veces. Mitigación en la versión actual: idempotencia en `d` tag por (sub, period_index) — el segundo gana al reemplazar, pero los sats se movieron. Aceptable en escala demo; producción agregaría un claim event o un lock externo (Vercel KV alcanza con una key).
- **Atomicidad transaccional**: si el worker muere entre `pay_invoice` exitoso y `publish` del charge event, queda un cobro sin registro. Reconciliación: en el próximo run el sub aparece como vencido todavía, hay que chequear el NWC del subscriber por payment-hash antes de re-cobrar. No implementado.
- **Vercel cron en plan free** corre 1× por día. Para demo en vivo se usa el botón "Correr ahora" o `curl` con `CRON_SECRET`. Producción real necesita cron de minutos.
- **Relays acotados a 5**. Algunos relays públicos no aceptan kinds altos sin pago. Los 5 default (Damus, nostr.band, nos.lol, primal, purplepag.es) los aceptan al momento de escribir esto.

---

## Roadmap post-hackathon

- Lock externo para el worker (Vercel KV o single-instance cron).
- Vercel Cron real con minutos.
- Cancelación de suscripciones (kind 30079 con `expires=0`).
- NIP-58 badge minteado al subscribe.
- Soporte BTCPay Server como rail adicional (su API `Subscriptions` es complementaria).
- Receipts/PDF de cobros para contabilidad.

---

## Créditos

- **La Crypta** — comunidad y organización del hackatón. El caso de uso flagship (cowork tuesdays + verificación por `npub` en la puerta) está pensado para ellos.
- **Wapupay** — sponsor del hackatón. La ruta `lud16 = usuario@wapu.app` convierte sats a ARS sin KYC al instante.
- **NDK** + **nostr-tools** — herramientas de las que nada de esto sería viable.
