import "server-only";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  readSessionCookieValue,
  type Session,
} from "./session";

// Read the current session inside a Server Component, Server Action, or
// Route Handler. Returns null if absent, malformed, expired, or tampered.
export function getSession(): Session | null {
  const raw = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  return readSessionCookieValue(raw);
}
