import { NextResponse, type NextRequest } from "next/server";
import NDK from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import { getSession } from "@/lib/server-session";
import { encrypt } from "@/lib/crypto";
import { store } from "@/lib/store";
import {
  PLAN_EVENT_KIND,
  parsePlanEvent,
  type PlanEventInput,
} from "@/lib/nostr/plan-event";
import { DEFAULT_RELAYS } from "@/lib/nostr/ndk";

export const runtime = "nodejs";

const NWC_RE = /^nostr\+walletconnect:\/\/[0-9a-f]{64}\?[^ ]+/i;

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session)
    return NextResponse.json({ error: "login required" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "expected object body" }, { status: 400 });
  const { planNaddr, nwcUri } = body as {
    planNaddr?: unknown;
    nwcUri?: unknown;
  };

  if (typeof planNaddr !== "string" || typeof nwcUri !== "string")
    return NextResponse.json(
      { error: "planNaddr and nwcUri are required strings" },
      { status: 400 },
    );
  if (!NWC_RE.test(nwcUri))
    return NextResponse.json(
      { error: "nwcUri must start with nostr+walletconnect://" },
      { status: 400 },
    );

  // Decode + fetch the plan from relays. Reuse the same race-with-timeout
  // pattern as the public plan page — we want to fail fast if relays are
  // slow rather than hold the subscribe request hostage.
  let decoded;
  try {
    decoded = nip19.decode(planNaddr);
  } catch {
    return NextResponse.json({ error: "malformed naddr" }, { status: 400 });
  }
  if (decoded.type !== "naddr" || decoded.data.kind !== PLAN_EVENT_KIND)
    return NextResponse.json({ error: "naddr is not a Zaploop plan" }, { status: 400 });

  const ndk = new NDK({
    explicitRelayUrls: decoded.data.relays?.length
      ? [...decoded.data.relays, ...DEFAULT_RELAYS]
      : [...DEFAULT_RELAYS],
  });
  try {
    await ndk.connect(3000);
  } catch {
    return NextResponse.json({ error: "could not reach relays" }, { status: 503 });
  }

  const fetched = await Promise.race([
    ndk.fetchEvent(planNaddr),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ]);
  if (!fetched || fetched.kind !== PLAN_EVENT_KIND)
    return NextResponse.json({ error: "plan event not found on relays" }, { status: 404 });

  const parsed = parsePlanEvent({
    kind: fetched.kind!,
    pubkey: fetched.pubkey,
    tags: fetched.tags,
  });

  // Refuse if the plan event is missing required fields.
  const missing: string[] = [];
  if (!parsed.slug) missing.push("slug");
  if (!parsed.name) missing.push("name");
  if (parsed.amountSat == null) missing.push("amount");
  if (!parsed.interval) missing.push("interval");
  if (!parsed.rail) missing.push("rail");
  if (missing.length)
    return NextResponse.json(
      { error: `plan event is missing tags: ${missing.join(", ")}` },
      { status: 422 },
    );

  let subscriberNwcUriEncrypted: string;
  try {
    subscriberNwcUriEncrypted = await encrypt(nwcUri);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "encryption failed" },
      { status: 500 },
    );
  }

  try {
    const { subscription, firstCharge } = await store.createSubscription({
      merchantPubkey: parsed.pubkey,
      planNaddr,
      planSlug: parsed.slug!,
      planName: parsed.name!,
      planAmountSat: parsed.amountSat!,
      planInterval: parsed.interval as PlanEventInput["interval"],
      rail: parsed.rail as PlanEventInput["rail"],
      subscriberPubkey: session.pubkey,
      subscriberNwcUriEncrypted,
    });
    return NextResponse.json({
      subscriptionId: subscription.id,
      firstChargeId: firstCharge.id,
      nextChargeAt: subscription.nextChargeAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "already_subscribed") {
      return NextResponse.json(
        {
          error: "already subscribed",
          subscriptionId: (err as { subscriptionId?: string }).subscriptionId,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
