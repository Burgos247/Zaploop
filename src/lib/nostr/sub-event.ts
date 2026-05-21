// Subscription event template — kind 30079, parameterized replaceable.
//
// Authored by the SUBSCRIBER (their npub is the source of truth that
// "I am subscribed to plan X"). The `d` tag is the plan's naddr so the
// same subscriber publishing again for the same plan REPLACES the
// previous event — natural idempotency, no race-prone "find existing
// then conditionally insert" dance.
//
// Content carries the subscriber's NWC URI, NIP-44 encrypted to the
// Zaploop server pubkey. Only the server's nsec can decrypt it; the
// worker uses it to fire pay_invoice each billing cycle. Until then,
// even Zaploop's web layer never sees the plaintext URI.
//
// Membership check (relay query): a single round trip with filter
//   { kinds:[30079], authors:[subscriber], '#p':[merchant], '#t':['zaploop:sub'] }
// then `expires_at` tag > now.

export const SUBSCRIPTION_EVENT_KIND = 30079;
export const SUBSCRIPTION_TAG = "zaploop:sub";

export type SubscriptionState = "active" | "canceled";

export type SubscriptionEventInput = {
  subscriberPubkey: string;
  merchantPubkey: string;
  planNaddr: string;
  planSlug: string;
  amountSat: number;
  interval: "weekly" | "monthly" | "quarterly" | "yearly";
  rail: "self" | "wapupay";
  expiresAt: number; // unix seconds — current period end
  nwcCiphertext: string; // NIP-44 ciphertext, encrypted to server pubkey
  state?: SubscriptionState; // defaults to "active"
};

export type UnsignedSubscriptionEvent = {
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
};

export function buildSubscriptionEventTemplate(
  input: SubscriptionEventInput,
  now: number = Math.floor(Date.now() / 1000),
): UnsignedSubscriptionEvent {
  if (!/^[0-9a-f]{64}$/.test(input.subscriberPubkey))
    throw new Error("subscriberPubkey must be 64 lowercase hex chars");
  if (!/^[0-9a-f]{64}$/.test(input.merchantPubkey))
    throw new Error("merchantPubkey must be 64 lowercase hex chars");
  if (input.amountSat <= 0 || !Number.isInteger(input.amountSat))
    throw new Error("amountSat must be a positive integer");
  if (input.expiresAt <= now)
    throw new Error("expiresAt must be in the future");

  return {
    kind: SUBSCRIPTION_EVENT_KIND,
    pubkey: input.subscriberPubkey,
    created_at: now,
    tags: [
      ["d", input.planNaddr],
      ["a", input.planNaddr],
      ["p", input.merchantPubkey],
      ["t", SUBSCRIPTION_TAG],
      ["state", input.state ?? "active"],
      ["expires", String(input.expiresAt)],
      ["interval", input.interval],
      ["amount", String(input.amountSat), "sat"],
      ["rail", input.rail],
      ["plan-slug", input.planSlug],
    ],
    content: input.nwcCiphertext,
  };
}

// Builds a replacement event that turns an existing subscription into
// `state: canceled`. Same `d` tag as the original so it replaces. No
// NWC URI required — there's nothing left to decrypt.
export type CancelEventInput = {
  subscriberPubkey: string;
  merchantPubkey: string;
  planNaddr: string;
};

export function buildCancelEventTemplate(
  input: CancelEventInput,
  now: number = Math.floor(Date.now() / 1000),
): UnsignedSubscriptionEvent {
  if (!/^[0-9a-f]{64}$/.test(input.subscriberPubkey))
    throw new Error("subscriberPubkey must be 64 lowercase hex chars");
  if (!/^[0-9a-f]{64}$/.test(input.merchantPubkey))
    throw new Error("merchantPubkey must be 64 lowercase hex chars");

  return {
    kind: SUBSCRIPTION_EVENT_KIND,
    pubkey: input.subscriberPubkey,
    created_at: now,
    tags: [
      ["d", input.planNaddr],
      ["a", input.planNaddr],
      ["p", input.merchantPubkey],
      ["t", SUBSCRIPTION_TAG],
      ["state", "canceled"],
      ["expires", "0"],
    ],
    content: "",
  };
}

export type ParsedSubscription = {
  subscriberPubkey: string;
  merchantPubkey: string | undefined;
  planNaddr: string | undefined;
  planSlug: string | undefined;
  amountSat: number | undefined;
  interval: SubscriptionEventInput["interval"] | undefined;
  rail: SubscriptionEventInput["rail"] | undefined;
  expiresAt: number | undefined;
  state: SubscriptionState;
  nwcCiphertext: string;
  createdAt: number;
};

export function parseSubscriptionEvent(event: {
  kind: number;
  pubkey: string;
  tags: string[][];
  content: string;
  created_at: number;
}): ParsedSubscription {
  if (event.kind !== SUBSCRIPTION_EVENT_KIND)
    throw new Error(`expected kind ${SUBSCRIPTION_EVENT_KIND}, got ${event.kind}`);

  const t = (name: string) => event.tags.find((x) => x[0] === name)?.[1];
  const expiresStr = t("expires");
  const amountStr = t("amount");

  // Missing state tag = active (backward compat with events created
  // before we introduced the cancel flow).
  const rawState = t("state");
  const state: SubscriptionState =
    rawState === "canceled" ? "canceled" : "active";

  return {
    subscriberPubkey: event.pubkey,
    merchantPubkey: t("p"),
    planNaddr: t("a") ?? t("d"),
    planSlug: t("plan-slug"),
    amountSat: amountStr ? Number(amountStr) : undefined,
    interval: t("interval") as ParsedSubscription["interval"],
    rail: t("rail") as ParsedSubscription["rail"],
    expiresAt: expiresStr ? Number(expiresStr) : undefined,
    state,
    nwcCiphertext: event.content,
    createdAt: event.created_at,
  };
}
