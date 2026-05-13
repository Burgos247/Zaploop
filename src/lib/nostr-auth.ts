import "server-only";
import { verifyEvent, type Event as NostrEvent } from "nostr-tools";

// Server-side Nostr auth.
//
// Flow:
//   1. Client builds a kind 22242 event ("HTTP auth", per NIP-42-style)
//      with tags [["u", origin], ["method", "POST"]] and a `created_at`
//      within the last 60 seconds, signs it with NIP-07 / NIP-46.
//   2. Client POSTs the signed event to /api/auth/login.
//   3. verifyAuthEvent below confirms signature + freshness + tags.
//   4. On success we mint a session cookie via createSession(pubkey).
//
// Note: this is replay-vulnerable within the 60s window. For hackathon
// scope that's acceptable. A challenge-response upgrade can come later.

export type NostrLoginEvent = NostrEvent;

export const AUTH_EVENT_KIND = 22242;
const MAX_AGE_SECONDS = 60;

export type AuthResult =
  | { ok: true; pubkey: string }
  | { ok: false; reason: string };

export function verifyAuthEvent(
  event: NostrLoginEvent,
  expectedOrigin: string,
): AuthResult {
  if (event.kind !== AUTH_EVENT_KIND)
    return { ok: false, reason: `wrong kind: ${event.kind}` };

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - event.created_at) > MAX_AGE_SECONDS)
    return { ok: false, reason: "event too old or too far in the future" };

  const uTag = event.tags.find((t) => t[0] === "u");
  if (!uTag || uTag[1] !== expectedOrigin)
    return { ok: false, reason: "u tag mismatch" };

  if (!verifyEvent(event))
    return { ok: false, reason: "invalid signature" };

  return { ok: true, pubkey: event.pubkey };
}

// ─── Session cookies ──────────────────────────────────────────────────
// Format: base64url(pubkey + "." + base64url(hmac(pubkey + "." + expiresAt)))
// Stored in an httpOnly Secure SameSite=Lax cookie.

import {
  createHmac,
  timingSafeEqual,
  randomBytes as nodeRandomBytes,
} from "node:crypto";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const SESSION_COOKIE_NAME = "zaploop_session";

function getSessionKey(): Buffer {
  const raw = process.env.ZAPLOOP_SESSION_KEY;
  if (!raw) throw new Error("Missing ZAPLOOP_SESSION_KEY");
  const buf = Buffer.from(raw, "base64");
  if (buf.byteLength < 32)
    throw new Error("ZAPLOOP_SESSION_KEY must decode to ≥32 bytes");
  return buf;
}

function sign(payload: string): string {
  return createHmac("sha256", getSessionKey())
    .update(payload)
    .digest("base64url");
}

export type Session = {
  pubkey: string;
  expiresAt: number; // unix seconds
};

export function createSessionCookieValue(
  pubkey: string,
  now = Math.floor(Date.now() / 1000),
): { value: string; expiresAt: number } {
  if (!/^[0-9a-f]{64}$/.test(pubkey))
    throw new Error("pubkey must be 64 lowercase hex chars");
  const expiresAt = now + SESSION_TTL_SECONDS;
  const payload = `${pubkey}.${expiresAt}`;
  return {
    value: `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`,
    expiresAt,
  };
}

export function readSessionCookieValue(value: string): Session | null {
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, mac] = parts;
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = sign(payload);
  const a = Buffer.from(mac, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [pubkey, expiresAtStr] = payload.split(".");
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() / 1000) return null;
  if (!/^[0-9a-f]{64}$/.test(pubkey)) return null;
  return { pubkey, expiresAt };
}

// Used in tests / scripts. Not for production traffic — webcrypto is fine
// for that path, but for symmetry with how routes build random nonces we
// re-export here.
export const _testHelpers = { sign, randomBytes: nodeRandomBytes };
