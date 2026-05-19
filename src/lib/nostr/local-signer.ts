// Browser-side ephemeral Nostr identity for users without a NIP-07
// extension. Generates a keypair, persists the secret in localStorage,
// and polyfills `window.nostr` with sign + NIP-44 support backed by
// nostr-tools.
//
// Security caveat (shown in UI when used): localStorage is vulnerable
// to XSS. Acceptable for a hackathon demo identity, NOT for any wallet
// holding real funds. We never auto-load actual sats into this.
//
// Extension precedence: if `window.nostr` already exists when we boot
// (e.g. Alby is installed), we do not overwrite it.

import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
  nip44,
} from "nostr-tools";

export const LOCAL_NSEC_KEY = "zaploop_local_nsec";

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function installShim(sk: Uint8Array) {
  const pk = getPublicKey(sk);
  // We assign as `any` because NDK's type augmentation widens
  // Window.nostr in ways that clash with our stricter declaration —
  // the runtime shape is what matters and matches NIP-07.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).nostr = {
    async getPublicKey() {
      return pk;
    },
    async signEvent(template: {
      kind: number;
      created_at: number;
      tags: string[][];
      content: string;
      pubkey?: string;
    }) {
      return finalizeEvent(
        {
          kind: template.kind,
          created_at: template.created_at,
          tags: template.tags,
          content: template.content,
        },
        sk,
      );
    },
    nip44: {
      async encrypt(theirPubkey: string, plaintext: string) {
        const conv = nip44.v2.utils.getConversationKey(sk, theirPubkey);
        return nip44.v2.encrypt(plaintext, conv);
      },
      async decrypt(theirPubkey: string, ciphertext: string) {
        const conv = nip44.v2.utils.getConversationKey(sk, theirPubkey);
        return nip44.v2.decrypt(ciphertext, conv);
      },
    },
  };
}

// Re-install the shim from localStorage on app boot. Returns the pubkey
// if a local identity was restored, null otherwise.
export function restoreLocalSigner(): string | null {
  if (typeof window === "undefined") return null;
  if (window.nostr) return null; // extension wins
  const skHex = window.localStorage.getItem(LOCAL_NSEC_KEY);
  if (!skHex) return null;
  try {
    const sk = hexToBytes(skHex);
    installShim(sk);
    return getPublicKey(sk);
  } catch {
    window.localStorage.removeItem(LOCAL_NSEC_KEY);
    return null;
  }
}

// Generate a fresh keypair, persist, install the shim. Returns the
// pubkey (hex) and the bech32 nsec so the caller can show a backup UI.
export function generateLocalIdentity(): { pubkey: string; nsec: string } {
  if (typeof window === "undefined")
    throw new Error("generateLocalIdentity can only run in the browser");
  const sk = generateSecretKey();
  const skHex = bytesToHex(sk);
  window.localStorage.setItem(LOCAL_NSEC_KEY, skHex);
  installShim(sk);
  return { pubkey: getPublicKey(sk), nsec: nip19.nsecEncode(sk) };
}

export function clearLocalIdentity() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCAL_NSEC_KEY);
}

export function hasLocalIdentity(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.localStorage.getItem(LOCAL_NSEC_KEY);
}
