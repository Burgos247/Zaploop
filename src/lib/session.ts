import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// HMAC-signed session cookie. Independent of Nostr — just maps a verified
// pubkey to a sticky session.
//
// Format: base64url(payload) "." base64url(hmac_sha256(payload))
// where payload is `<64-char-hex-pubkey>.<unix-seconds-expiry>`.

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
  expiresAt: number;
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
