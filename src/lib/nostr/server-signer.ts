import "server-only";
import {
  finalizeEvent,
  getPublicKey,
  nip19,
  nip44,
  type EventTemplate,
} from "nostr-tools";

// Loads ZAPLOOP_SERVER_NSEC once per process. Exposes:
//   - getServerKeys()        → { sk, pk }
//   - signWithServer(...)    → signed Nostr event by the server identity
//   - decryptFromSubscriber  → NIP-44 unseals NWC URIs sent by subscribers

let cached: { sk: Uint8Array; pk: string } | null = null;

export function getServerKeys(): { sk: Uint8Array; pk: string } {
  if (cached) return cached;
  const raw = process.env.ZAPLOOP_SERVER_NSEC;
  if (!raw) throw new Error("Missing ZAPLOOP_SERVER_NSEC");
  const decoded = nip19.decode(raw);
  if (decoded.type !== "nsec")
    throw new Error("ZAPLOOP_SERVER_NSEC must be a bech32 nsec");
  const sk = decoded.data;
  const pk = getPublicKey(sk);
  cached = { sk, pk };
  return cached;
}

export function signWithServer(template: EventTemplate & { pubkey?: string }) {
  const { sk } = getServerKeys();
  return finalizeEvent(
    {
      kind: template.kind,
      created_at: template.created_at,
      tags: template.tags,
      content: template.content,
    },
    sk,
  );
}

export function nip44DecryptFromSubscriber(
  subscriberPubkey: string,
  ciphertext: string,
): string {
  const { sk } = getServerKeys();
  const conversationKey = nip44.v2.utils.getConversationKey(sk, subscriberPubkey);
  return nip44.v2.decrypt(ciphertext, conversationKey);
}
