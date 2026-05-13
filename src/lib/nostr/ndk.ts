import NDK from "@nostr-dev-kit/ndk";

// Default relay set. Mirrors the lacrypta/nostr-starter convention so
// our published events land where the hackathon community (and jury)
// already look.
export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://purplepag.es",
] as const;

// One NDK instance per process. Server-side flows (event verification,
// fetching) get a relay-less instance by default; helpers that need to
// publish reach for `getPublishingNDK()` which connects on first use.
let verifyOnly: NDK | null = null;
let publishing: NDK | null = null;

export function getVerifyNDK(): NDK {
  if (!verifyOnly) verifyOnly = new NDK({ explicitRelayUrls: [] });
  return verifyOnly;
}

export async function getPublishingNDK(): Promise<NDK> {
  if (publishing) return publishing;
  publishing = new NDK({ explicitRelayUrls: [...DEFAULT_RELAYS] });
  await publishing.connect();
  return publishing;
}
