#!/usr/bin/env node
// Print a fresh base64-encoded 32-byte key for ZAPLOOP_SESSION_KEY (HMAC).
// Usage: node scripts/gen-session-key.mjs

import { randomBytes } from "node:crypto";

console.log(randomBytes(32).toString("base64"));
