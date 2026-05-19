#!/usr/bin/env node
// Generate a Nostr keypair for the Zaploop server.
//
// The pubkey ends up in NEXT_PUBLIC_ZAPLOOP_SERVER_PUBKEY (clients
// NIP-44 encrypt subscribers' NWC URIs to it). The nsec ends up in
// ZAPLOOP_SERVER_NSEC (server-only) and is used by the billing worker
// to decrypt NWC URIs before issuing pay_invoice.
//
// Usage: node scripts/gen-server-keypair.mjs

import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";

const sk = generateSecretKey(); // Uint8Array
const pk = getPublicKey(sk);
const nsec = nip19.nsecEncode(sk);
const npub = nip19.npubEncode(pk);

console.log("# Zaploop server keypair — keep nsec PRIVATE.");
console.log("NEXT_PUBLIC_ZAPLOOP_SERVER_PUBKEY=" + pk);
console.log("# (npub form, informational: " + npub + ")");
console.log("ZAPLOOP_SERVER_NSEC=" + nsec);
