#!/usr/bin/env node
// Print a fresh random Bearer secret for the /api/cron/billing endpoint.
// Usage: node scripts/gen-cron-secret.mjs

import { randomBytes } from "node:crypto";

console.log("CRON_SECRET=" + randomBytes(24).toString("base64url"));
