import { NextResponse, type NextRequest } from "next/server";
import NDK, { type NDKKind } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import { DEFAULT_RELAYS } from "@/lib/nostr/ndk";
import {
  SUBSCRIPTION_EVENT_KIND,
  SUBSCRIPTION_TAG,
  parseSubscriptionEvent,
} from "@/lib/nostr/sub-event";
import {
  CHARGE_EVENT_KIND,
  CHARGE_TAG,
  parseChargeEvent,
} from "@/lib/nostr/charge-event";

export const runtime = "nodejs";

// Public membership check. Active if EITHER:
//   - The subscriber's kind 30079 has `expires > now` (covers freshly
//     subscribed before the first charge runs), OR
//   - The latest server-signed kind 30080 paid charge for that sub
//     has `valid_until > now` (covers everything after the worker has
//     extended the period).
//
// TODO before prod: gate behind per-tenant API token.

function toPubkey(input: string | null): string | null {
  if (!input) return null;
  if (/^[0-9a-f]{64}$/i.test(input)) return input.toLowerCase();
  try {
    const decoded = nip19.decode(input);
    if (decoded.type === "npub") return decoded.data;
  } catch {}
  return null;
}

export async function GET(req: NextRequest) {
  const merchant = toPubkey(req.nextUrl.searchParams.get("m"));
  const subscriber = toPubkey(req.nextUrl.searchParams.get("u"));
  if (!merchant || !subscriber) {
    return NextResponse.json(
      { error: "m and u are required (hex or npub)" },
      { status: 400 },
    );
  }

  const ndk = new NDK({ explicitRelayUrls: [...DEFAULT_RELAYS] });
  try {
    await ndk.connect(3000);
  } catch {
    return NextResponse.json({ error: "could not reach relays" }, { status: 503 });
  }

  const subEvents = await Promise.race([
    ndk.fetchEvents({
      kinds: [SUBSCRIPTION_EVENT_KIND as NDKKind],
      authors: [subscriber],
      "#p": [merchant],
      "#t": [SUBSCRIPTION_TAG],
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ]);

  if (!subEvents) {
    return NextResponse.json(
      { error: "timed out waiting for relays" },
      { status: 504 },
    );
  }

  const now = Math.floor(Date.now() / 1000);

  for (const subEvent of subEvents) {
    const sub = parseSubscriptionEvent({
      kind: subEvent.kind!,
      pubkey: subEvent.pubkey,
      tags: subEvent.tags,
      content: subEvent.content,
      created_at: subEvent.created_at!,
    });

    // Canceled subs are never active, regardless of expires/charges.
    if (sub.state === "canceled") continue;

    // Latest paid charge for this sub.
    const dTag = subEvent.tags.find((t) => t[0] === "d")?.[1];
    const subNaddr = dTag
      ? nip19.naddrEncode({
          identifier: dTag,
          pubkey: subEvent.pubkey,
          kind: SUBSCRIPTION_EVENT_KIND,
          relays: DEFAULT_RELAYS.slice(0, 3),
        })
      : null;

    let chargeValidUntil: number | null = null;
    if (subNaddr) {
      const chargeEvents = await Promise.race([
        ndk.fetchEvents({
          kinds: [CHARGE_EVENT_KIND as NDKKind],
          "#a": [subNaddr],
          "#t": [CHARGE_TAG],
          limit: 10,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (chargeEvents) {
        for (const c of chargeEvents) {
          const parsed = parseChargeEvent({
            kind: c.kind!,
            pubkey: c.pubkey,
            tags: c.tags,
            content: c.content,
            created_at: c.created_at!,
          });
          if (parsed.state !== "paid") continue;
          if (parsed.validUntil && parsed.validUntil > (chargeValidUntil ?? 0)) {
            chargeValidUntil = parsed.validUntil;
          }
        }
      }
    }

    const effectiveExpires = Math.max(sub.expiresAt ?? 0, chargeValidUntil ?? 0);
    if (effectiveExpires > now) {
      return NextResponse.json({
        active: true,
        plan: {
          slug: sub.planSlug,
          rail: sub.rail,
          amountSat: sub.amountSat,
          interval: sub.interval,
        },
        expiresAt: effectiveExpires,
        source: chargeValidUntil && chargeValidUntil >= (sub.expiresAt ?? 0) ? "charge" : "subscription",
      });
    }
  }

  return NextResponse.json({ active: false });
}
