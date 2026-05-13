import "server-only";

// AES-256-GCM wrapper around Web Crypto. Used to encrypt NWC URIs and
// Wapupay API tokens before they touch the database.
//
// Output format (base64-url-safe): iv ‖ ciphertext ‖ authTag, where the
// IV is 12 random bytes and the auth tag is appended by SubtleCrypto.
// Round-trip is symmetric — same key required to decrypt.
//
// Key source: ZAPLOOP_SECRETS_KEY env var, base64-encoded 32 raw bytes.
// Generate with `node scripts/gen-secrets-key.mjs`.

const IV_BYTES = 12;

let cachedKey: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const raw = process.env.ZAPLOOP_SECRETS_KEY;
  if (!raw) throw new Error("Missing ZAPLOOP_SECRETS_KEY");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.byteLength !== 32) {
    throw new Error(
      `ZAPLOOP_SECRETS_KEY must decode to 32 bytes, got ${bytes.byteLength}`,
    );
  }
  cachedKey = await crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  return cachedKey;
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const out = new Uint8Array(IV_BYTES + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), IV_BYTES);
  return Buffer.from(out).toString("base64");
}

export async function decrypt(blob: string): Promise<string> {
  const key = await getKey();
  const bytes = Buffer.from(blob, "base64");
  if (bytes.byteLength <= IV_BYTES) throw new Error("ciphertext too short");
  const iv = bytes.subarray(0, IV_BYTES);
  const ct = bytes.subarray(IV_BYTES);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
