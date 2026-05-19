import "server-only";
import { nwc } from "@getalby/sdk";

// Thin server-side wrapper around Alby's NWCClient. Each call opens a
// fresh client, pays, and closes — Vercel functions are short-lived
// anyway, so pooling buys nothing.

export async function payInvoiceViaNwc(
  nwcUri: string,
  invoice: string,
): Promise<{ preimage: string }> {
  const client = new nwc.NWCClient({ nostrWalletConnectUrl: nwcUri });
  try {
    const result = await client.payInvoice({ invoice });
    if (!result.preimage) throw new Error("NWC response missing preimage");
    return { preimage: result.preimage };
  } finally {
    try {
      (client as unknown as { close?: () => void }).close?.();
    } catch {}
  }
}
