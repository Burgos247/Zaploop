// Plan → Nostr event mapping.
//
// We model a Zaploop plan as a NIP-78 application-specific replaceable event
// (kind 30078) authored by the merchant. The `d` tag is the per-tenant plan
// slug, which makes the event uniquely addressable as
// `naddr1...` and naturally replaceable when the merchant edits it.
//
// This module returns an **unsigned template**. The actual signing happens
// in the browser via NIP-07 (or NIP-46) so the merchant's private key
// stays where it belongs. Zaploop's server never holds merchant keys.
//
// To publish: client takes this template, calls `window.nostr.signEvent`,
// then uses NDK in the browser to `ndkEvent.publish()` against
// DEFAULT_RELAYS from src/lib/nostr/ndk.ts.

export const PLAN_EVENT_KIND = 30078;
export const PLAN_TAG = "zaploop:plan";
export const APP_CLIENT_TAG = "zaploop";

export type PlanEventInput = {
  pubkey: string; // merchant pubkey (64-char hex)
  slug: string;
  name: string;
  description?: string | null;
  amountSat: number;
  interval: "weekly" | "monthly" | "quarterly" | "yearly";
  rail: "self" | "wapupay";
  tenantSlug: string; // for human-readable discovery
};

export type UnsignedPlanEvent = {
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
};

export function buildPlanEventTemplate(
  input: PlanEventInput,
  now: number = Math.floor(Date.now() / 1000),
): UnsignedPlanEvent {
  if (!/^[0-9a-f]{64}$/.test(input.pubkey))
    throw new Error("pubkey must be 64 lowercase hex chars");
  if (!input.slug.match(/^[a-z0-9-]+$/))
    throw new Error("plan slug must be lowercase letters, digits, hyphens");
  if (input.amountSat <= 0 || !Number.isInteger(input.amountSat))
    throw new Error("amountSat must be a positive integer");

  const tags: string[][] = [
    ["d", input.slug],
    ["title", input.name],
    ["amount", String(input.amountSat), "sat"],
    ["interval", input.interval],
    ["rail", input.rail],
    ["t", PLAN_TAG],
    ["client", APP_CLIENT_TAG],
    ["tenant", input.tenantSlug],
  ];
  if (input.description) tags.push(["summary", input.description]);

  return {
    kind: PLAN_EVENT_KIND,
    pubkey: input.pubkey,
    created_at: now,
    tags,
    content: "",
  };
}

// Inverse — read a signed plan event back into our domain shape. Useful
// when reconciling DB ↔ Nostr or when reading a plan addressed by naddr.
export function parsePlanEvent(event: {
  kind: number;
  pubkey: string;
  tags: string[][];
}): Partial<PlanEventInput> & { pubkey: string } {
  if (event.kind !== PLAN_EVENT_KIND)
    throw new Error(`expected kind ${PLAN_EVENT_KIND}, got ${event.kind}`);

  const t = (name: string) => event.tags.find((x) => x[0] === name)?.[1];
  const amount = t("amount");
  const interval = t("interval");
  const rail = t("rail");

  return {
    pubkey: event.pubkey,
    slug: t("d"),
    name: t("title"),
    description: t("summary"),
    amountSat: amount ? Number(amount) : undefined,
    interval: interval as PlanEventInput["interval"] | undefined,
    rail: rail as PlanEventInput["rail"] | undefined,
    tenantSlug: t("tenant"),
  };
}
