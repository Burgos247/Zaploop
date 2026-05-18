import { NextResponse, type NextRequest } from "next/server";
import { nip19 } from "nostr-tools";
import { store } from "@/lib/store";

export const runtime = "nodejs";

// Public membership check. The La Crypta cowork door reads the
// subscriber's npub off a QR and calls this endpoint to gate access.
//
// Inputs (query string):
//   m = merchant pubkey, accepts hex (64 chars) or bech32 (npub1…).
//   u = subscriber pubkey, same.
//
// Response:
//   { active: boolean, plan?, periodEnd?, subscriptionId? }
//
// TODO before prod: gate this behind a per-tenant API token so a
// merchant decides who can query their membership state. Today it's
// open — fine for the hackathon, not for actual deployments.

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

  const result = await store.isMembershipActive(merchant, subscriber);
  if (!result.active || !result.subscription) {
    return NextResponse.json({ active: false });
  }
  const s = result.subscription;
  return NextResponse.json({
    active: true,
    plan: { slug: s.planSlug, name: s.planName, rail: s.rail, amountSat: s.planAmountSat },
    periodEnd: s.currentPeriodEnd,
    subscriptionId: s.id,
  });
}
