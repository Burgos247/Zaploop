import { NextResponse, type NextRequest } from "next/server";
import NDK, { NDKEvent, type NDKKind } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import { DEFAULT_RELAYS } from "@/lib/nostr/ndk";
import {
  SUBSCRIPTION_EVENT_KIND,
  SUBSCRIPTION_TAG,
  parseSubscriptionEvent,
} from "@/lib/nostr/sub-event";
import { PLAN_EVENT_KIND, parsePlanEvent } from "@/lib/nostr/plan-event";
import {
  CHARGE_EVENT_KIND,
  CHARGE_TAG,
  buildChargeEventTemplate,
  parseChargeEvent,
} from "@/lib/nostr/charge-event";
import {
  getServerKeys,
  signWithServer,
  nip44DecryptFromSubscriber,
} from "@/lib/nostr/server-signer";
import { resolveLnurlPay } from "@/lib/lnurl";
import { payInvoiceViaNwc } from "@/lib/nwc-pay";
import { addInterval } from "@/lib/billing/interval";
import { getSession } from "@/lib/server-session";

export const runtime = "nodejs";
export const maxDuration = 60;

// The worker. Accepts either:
//   - Authorization: Bearer ${CRON_SECRET}  (scheduled cron / curl)
//   - A valid Zaploop session cookie         (logged-in manual trigger)
//
// For each due subscription (kind 30079) it:
//   1. Looks up the plan (kind 30078) by the `a` tag naddr.
//   2. Resolves the plan's lud16 to a bolt11 invoice via LNURL-pay.
//   3. Decrypts the subscriber's NWC URI with the server nsec.
//   4. Pays the invoice with the subscriber's NWC.
//   5. Publishes a kind 30080 charge event (paid or failed) signed by
//      the server, with valid_until = now + interval so membership
//      checks reflect renewal.

type Outcome =
  | { sub: string; result: "skipped"; reason: string }
  | { sub: string; result: "paid"; preimage: string }
  | { sub: string; result: "failed"; error: string };

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${secret}`) return true;
  }
  return !!getSession();
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let serverPubkey: string;
  try {
    serverPubkey = getServerKeys().pk;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "server keys missing" },
      { status: 500 },
    );
  }

  const ndk = new NDK({ explicitRelayUrls: [...DEFAULT_RELAYS] });
  try {
    await ndk.connect(3000);
  } catch {
    return NextResponse.json({ error: "could not reach relays" }, { status: 503 });
  }

  // Pull every Zaploop sub event off the relays we know. At demo scale
  // (<100) that's fine; production needs pagination + relay-side filters.
  const subEvents = await ndk.fetchEvents({
    kinds: [SUBSCRIPTION_EVENT_KIND as NDKKind],
    "#t": [SUBSCRIPTION_TAG],
    limit: 200,
  });

  const now = Math.floor(Date.now() / 1000);
  const outcomes: Outcome[] = [];

  for (const subEvent of subEvents) {
    const sub = parseSubscriptionEvent({
      kind: subEvent.kind!,
      pubkey: subEvent.pubkey,
      tags: subEvent.tags,
      content: subEvent.content,
      created_at: subEvent.created_at!,
    });
    const dTag = subEvent.tags.find((t) => t[0] === "d")?.[1];
    const subNaddr = dTag
      ? nip19.naddrEncode({
          identifier: dTag,
          pubkey: subEvent.pubkey,
          kind: SUBSCRIPTION_EVENT_KIND,
          relays: DEFAULT_RELAYS.slice(0, 3),
        })
      : "unknown";

    if (sub.state === "canceled") {
      outcomes.push({ sub: subNaddr, result: "skipped", reason: "canceled" });
      continue;
    }

    if (!sub.planNaddr || !sub.amountSat || !sub.interval) {
      outcomes.push({ sub: subNaddr, result: "skipped", reason: "missing tags" });
      continue;
    }

    // Last paid charge — used both for idempotency and for renewal timing.
    const priorCharges = await ndk.fetchEvents({
      kinds: [CHARGE_EVENT_KIND as NDKKind],
      authors: [serverPubkey],
      "#a": [subNaddr],
      "#t": [CHARGE_TAG],
      limit: 10,
    });
    let latestPaidAt: number | null = null;
    let latestPeriodIndex = -1;
    for (const c of priorCharges) {
      const parsed = parseChargeEvent({
        kind: c.kind!,
        pubkey: c.pubkey,
        tags: c.tags,
        content: c.content,
        created_at: c.created_at!,
      });
      if (parsed.state !== "paid") continue;
      if (parsed.createdAt > (latestPaidAt ?? 0)) {
        latestPaidAt = parsed.createdAt;
        latestPeriodIndex = parsed.periodIndex ?? latestPeriodIndex;
      }
    }

    // Cycle in seconds derived from the interval, used to decide if the
    // current period has already been paid.
    const cycle = addInterval(0, sub.interval);
    if (latestPaidAt !== null && latestPaidAt + cycle > now) {
      outcomes.push({
        sub: subNaddr,
        result: "skipped",
        reason: `already paid until ${latestPaidAt + cycle}`,
      });
      continue;
    }

    const periodIndex = latestPeriodIndex + 1;

    try {
      // 1. Plan
      const planEvent = await ndk.fetchEvent(sub.planNaddr);
      if (!planEvent || planEvent.kind !== PLAN_EVENT_KIND)
        throw new Error("plan event not found on relays");
      const plan = parsePlanEvent({
        kind: planEvent.kind,
        pubkey: planEvent.pubkey,
        tags: planEvent.tags,
      });
      if (!plan.lud16) throw new Error("plan has no lud16 — cannot resolve invoice");

      // 2. LNURL-pay → invoice
      const { invoice } = await resolveLnurlPay(plan.lud16, sub.amountSat);

      // 3. Decrypt subscriber NWC
      let nwcUri: string;
      try {
        nwcUri = nip44DecryptFromSubscriber(sub.subscriberPubkey, sub.nwcCiphertext);
      } catch {
        throw new Error("could not decrypt subscriber NWC URI (wrong server nsec?)");
      }

      // 4. Pay
      const { preimage } = await payInvoiceViaNwc(nwcUri, invoice);

      // 5. Publish paid charge event
      const validUntil = now + cycle;
      const tmpl = buildChargeEventTemplate(
        {
          serverPubkey,
          subscriptionNaddr: subNaddr,
          merchantPubkey: plan.pubkey,
          subscriberPubkey: sub.subscriberPubkey,
          amountSat: sub.amountSat,
          state: "paid",
          periodIndex,
          preimage,
          validUntil,
        },
        now,
      );
      const signed = signWithServer(tmpl);
      const accepted = await new NDKEvent(ndk, signed).publish(undefined, 5000);
      if (accepted.size === 0) {
        // The sats moved but no relay durably persisted the charge event.
        // Next worker run would not see the dedup marker and try to pay
        // again. Surface as failed so the outcome flags it for retry.
        throw new Error(
          "pago hecho pero ningún relay aceptó el charge event — riesgo de doble cobro",
        );
      }

      outcomes.push({ sub: subNaddr, result: "paid", preimage: preimage.slice(0, 16) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Only publish a failure event if we have enough to address it.
      // Otherwise the outcome still lands in the response payload.
      if (sub.merchantPubkey) {
        try {
          const tmpl = buildChargeEventTemplate(
            {
              serverPubkey,
              subscriptionNaddr: subNaddr,
              merchantPubkey: sub.merchantPubkey,
              subscriberPubkey: sub.subscriberPubkey,
              amountSat: sub.amountSat ?? 0,
              state: "failed",
              periodIndex,
              errorCode: "worker_error",
              errorMessage: message,
            },
            now,
          );
          const signed = signWithServer(tmpl);
          await new NDKEvent(ndk, signed).publish(undefined, 5000);
        } catch {}
      }
      outcomes.push({ sub: subNaddr, result: "failed", error: message });
    }
  }

  return NextResponse.json({
    processedAt: now,
    serverPubkey,
    outcomes,
  });
}
