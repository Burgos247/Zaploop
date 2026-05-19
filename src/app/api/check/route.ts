import { NextResponse, type NextRequest } from "next/server";
import NDK, { type NDKKind } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import { DEFAULT_RELAYS } from "@/lib/nostr/ndk";
import {
  SUBSCRIPTION_EVENT_KIND,
  SUBSCRIPTION_TAG,
  parseSubscriptionEvent,
} from "@/lib/nostr/sub-event";

export const runtime = "nodejs";

// Public membership check, Nostr-native. Door scanner sends merchant
// pubkey + subscriber pubkey; we query relays for the subscriber's
// active kind 30079 event tagged with that merchant.
//
// No DB, no auth — the data already lives on relays. TODO before prod:
// gate behind a per-tenant API token so merchants control who can query
// their membership state.

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
    return NextResponse.json(
      { error: "could not reach relays" },
      { status: 503 },
    );
  }

  // Replaceable events: at most one per (subscriber, merchant, plan).
  // The subscriber may have several plans with the same merchant — we
  // count membership active if any one of them is still in period.
  const events = await Promise.race([
    ndk.fetchEvents({
      kinds: [SUBSCRIPTION_EVENT_KIND as NDKKind],
      authors: [subscriber],
      "#p": [merchant],
      "#t": [SUBSCRIPTION_TAG],
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ]);

  if (!events) {
    return NextResponse.json(
      { error: "timed out waiting for relays" },
      { status: 504 },
    );
  }

  const now = Math.floor(Date.now() / 1000);
  for (const e of events) {
    const parsed = parseSubscriptionEvent({
      kind: e.kind!,
      pubkey: e.pubkey,
      tags: e.tags,
      content: e.content,
      created_at: e.created_at!,
    });
    if (parsed.expiresAt && parsed.expiresAt > now) {
      return NextResponse.json({
        active: true,
        plan: {
          slug: parsed.planSlug,
          rail: parsed.rail,
          amountSat: parsed.amountSat,
          interval: parsed.interval,
        },
        expiresAt: parsed.expiresAt,
      });
    }
  }

  return NextResponse.json({ active: false });
}
