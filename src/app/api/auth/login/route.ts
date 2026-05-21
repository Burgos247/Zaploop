import { NextResponse, type NextRequest } from "next/server";
import type { NostrEvent } from "@nostr-dev-kit/ndk";
import { verifyAuthEvent } from "@/lib/nostr/auth";
import {
  SESSION_COOKIE_NAME,
  createSessionCookieValue,
} from "@/lib/session";

export const runtime = "nodejs";

function isSignedEventLike(x: unknown): x is NostrEvent {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.pubkey === "string" &&
    typeof o.sig === "string" &&
    typeof o.kind === "number" &&
    typeof o.created_at === "number" &&
    typeof o.content === "string" &&
    Array.isArray(o.tags)
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // The client posts the raw signed Nostr event.
  if (!isSignedEventLike(body)) {
    return NextResponse.json({ error: "expected a signed event" }, { status: 400 });
  }

  const origin = req.nextUrl.origin;
  const result = await verifyAuthEvent(body, origin);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }

  const { value, expiresAt } = createSessionCookieValue(result.pubkey);
  const res = NextResponse.json({ pubkey: result.pubkey });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt * 1000),
  });
  return res;
}
