import "server-only";
import { NDKEvent, type NostrEvent } from "@nostr-dev-kit/ndk";
import { getVerifyNDK } from "./ndk";

// Server-side login verification. Aligns with the lacrypta/nostr-starter
// idiom of using NDK end-to-end.
//
// Client flow (handled in a Client Component):
//   1. Build a kind 22242 event with tags [["u", origin], ["method","POST"]]
//      and `created_at` ≈ now.
//   2. Sign via NIP-07 (`window.nostr.signEvent`) or NIP-46 bunker.
//   3. POST the signed event to /api/auth/login.
//
// We verify here. Replay window is 60s — acceptable for hackathon scope.

export const AUTH_EVENT_KIND = 22242;
const MAX_AGE_SECONDS = 60;

export type AuthResult =
  | { ok: true; pubkey: string }
  | { ok: false; reason: string };

export async function verifyAuthEvent(
  raw: NostrEvent,
  expectedOrigin: string,
): Promise<AuthResult> {
  if (raw.kind !== AUTH_EVENT_KIND)
    return { ok: false, reason: `wrong kind: ${raw.kind}` };

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - raw.created_at) > MAX_AGE_SECONDS)
    return { ok: false, reason: "event too old or too far in the future" };

  const uTag = raw.tags.find((t) => t[0] === "u");
  if (!uTag || uTag[1] !== expectedOrigin)
    return { ok: false, reason: "u tag mismatch" };

  const event = new NDKEvent(getVerifyNDK(), raw);
  if (!event.verifySignature(true))
    return { ok: false, reason: "invalid signature" };

  return { ok: true, pubkey: raw.pubkey };
}
