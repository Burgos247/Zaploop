// Charge event — kind 30080, parameterized replaceable, signed by the
// Zaploop server. One per (subscription, period). Replaces the prior
// state for the same period as the worker progresses through its
// state machine.
//
// `d` = "<sub_naddr>:<period_index>" so the worker can both check
// "have we paid period N yet?" and idempotently update a single row.

export const CHARGE_EVENT_KIND = 30080;
export const CHARGE_TAG = "zaploop:charge";

export type ChargeEventInput = {
  serverPubkey: string;
  subscriptionNaddr: string;
  merchantPubkey: string; // for the merchant's dashboard filter
  subscriberPubkey: string; // standard NIP-01 #p tag
  amountSat: number;
  state: "paid" | "failed";
  periodIndex: number;
  preimage?: string;
  validUntil?: number; // unix seconds — when membership expires after this charge
  errorCode?: string;
  errorMessage?: string;
};

export type UnsignedChargeEvent = {
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
};

export function buildChargeEventTemplate(
  input: ChargeEventInput,
  now: number = Math.floor(Date.now() / 1000),
): UnsignedChargeEvent {
  if (!/^[0-9a-f]{64}$/.test(input.serverPubkey))
    throw new Error("serverPubkey must be 64 lowercase hex chars");

  const tags: string[][] = [
    ["d", `${input.subscriptionNaddr}:${input.periodIndex}`],
    ["a", input.subscriptionNaddr],
    ["m", input.merchantPubkey],
    ["p", input.subscriberPubkey],
    ["t", CHARGE_TAG],
    ["state", input.state],
    ["amount", String(input.amountSat), "sat"],
    ["period", String(input.periodIndex)],
  ];
  if (input.validUntil) tags.push(["valid_until", String(input.validUntil)]);
  if (input.preimage) tags.push(["preimage", input.preimage]);
  if (input.errorCode)
    tags.push(["error", input.errorCode, (input.errorMessage ?? "").slice(0, 200)]);

  return {
    kind: CHARGE_EVENT_KIND,
    pubkey: input.serverPubkey,
    created_at: now,
    tags,
    content: "",
  };
}

export type ParsedCharge = {
  subscriptionNaddr: string | undefined;
  merchantPubkey: string | undefined;
  subscriberPubkey: string | undefined;
  state: "paid" | "failed" | undefined;
  amountSat: number | undefined;
  periodIndex: number | undefined;
  validUntil: number | undefined;
  preimage: string | undefined;
  errorCode: string | undefined;
  errorMessage: string | undefined;
  createdAt: number;
};

export function parseChargeEvent(event: {
  kind: number;
  pubkey: string;
  tags: string[][];
  content: string;
  created_at: number;
}): ParsedCharge {
  if (event.kind !== CHARGE_EVENT_KIND)
    throw new Error(`expected kind ${CHARGE_EVENT_KIND}, got ${event.kind}`);

  const t = (name: string) => event.tags.find((x) => x[0] === name)?.[1];
  const e = event.tags.find((x) => x[0] === "error");
  const amount = t("amount");
  const period = t("period");
  const valid = t("valid_until");

  return {
    subscriptionNaddr: t("a"),
    merchantPubkey: t("m"),
    subscriberPubkey: t("p"),
    state: t("state") as "paid" | "failed" | undefined,
    amountSat: amount ? Number(amount) : undefined,
    periodIndex: period ? Number(period) : undefined,
    validUntil: valid ? Number(valid) : undefined,
    preimage: t("preimage"),
    errorCode: e?.[1],
    errorMessage: e?.[2],
    createdAt: event.created_at,
  };
}
