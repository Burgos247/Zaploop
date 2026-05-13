// Tiny module of constants that are safe to import from both Client and
// Server components. The full auth.ts is `server-only`-fenced because it
// pulls in NDK + node:crypto; this file is the slim surface clients need.

export const AUTH_EVENT_KIND = 22242;
