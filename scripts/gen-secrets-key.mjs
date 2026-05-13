#!/usr/bin/env node
// Print a fresh base64-encoded 32-byte key for ZAPLOOP_SECRETS_KEY.
// Usage: node scripts/gen-secrets-key.mjs
//
// Copy the output into .env.local. Rotating means re-encrypting every
// row that uses crypto.ts, so pick once and keep it.

import { randomBytes } from "node:crypto";

console.log(randomBytes(32).toString("base64"));
