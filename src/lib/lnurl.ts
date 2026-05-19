import "server-only";

// LNURL-pay (LUD-06 / LUD-16). Resolves user@domain to a bolt11 invoice
// for the requested amount. Used by the billing worker.

type LnurlpMeta = {
  callback: string;
  minSendable: number; // msat
  maxSendable: number; // msat
  tag?: string;
  commentAllowed?: number;
};

type LnurlpInvoiceResponse = {
  pr: string;
  status?: string;
  reason?: string;
};

export async function resolveLnurlPay(
  lud16: string,
  amountSat: number,
  comment?: string,
): Promise<{ invoice: string }> {
  const [name, domain] = lud16.split("@");
  if (!name || !domain) throw new Error(`invalid lud16: ${lud16}`);

  const metaUrl = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`;
  const metaRes = await fetch(metaUrl, { headers: { accept: "application/json" } });
  if (!metaRes.ok) throw new Error(`lnurlp metadata HTTP ${metaRes.status} at ${metaUrl}`);
  const meta: LnurlpMeta = await metaRes.json();
  if (meta.tag && meta.tag !== "payRequest")
    throw new Error(`lnurlp tag is ${meta.tag}, expected payRequest`);

  const msat = amountSat * 1000;
  if (msat < meta.minSendable || msat > meta.maxSendable)
    throw new Error(
      `${amountSat} sat outside lnurlp range [${meta.minSendable / 1000}, ${meta.maxSendable / 1000}]`,
    );

  const callbackUrl = new URL(meta.callback);
  callbackUrl.searchParams.set("amount", String(msat));
  if (comment && meta.commentAllowed)
    callbackUrl.searchParams.set("comment", comment.slice(0, meta.commentAllowed));

  const cbRes = await fetch(callbackUrl.toString(), {
    headers: { accept: "application/json" },
  });
  if (!cbRes.ok)
    throw new Error(`lnurlp callback HTTP ${cbRes.status} at ${callbackUrl}`);
  const cb: LnurlpInvoiceResponse = await cbRes.json();
  if (cb.status === "ERROR") throw new Error(cb.reason ?? "lnurlp callback returned ERROR");
  if (!cb.pr) throw new Error("lnurlp callback returned no invoice (pr)");
  return { invoice: cb.pr };
}
