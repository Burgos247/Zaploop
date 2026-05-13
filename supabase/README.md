# Supabase

The Postgres schema for Zaploop. Two ways to apply it.

## Option A — Supabase CLI (recommended once we're iterating)

```bash
brew install supabase/tap/supabase
supabase link --project-ref <your-project-ref>
supabase db push
```

## Option B — SQL editor (one-shot, no CLI needed)

1. Open the project's SQL editor in the Supabase dashboard.
2. Paste the contents of `migrations/0001_init.sql`.
3. Run.

## Conventions

- Files are named `NNNN_short_description.sql`, monotonically increasing.
- Each migration is idempotent where reasonable (`create extension if not exists`, `create or replace function`), but `create type` / `create table` are not — never re-run a migration on a DB that already has it.
- Schema decisions live in comments inside the SQL, not in this README.

## Why RLS is not enabled

All DB access is mediated by the Next.js backend using the `service_role`
key, after we've verified a Nostr signature server-side. Enabling RLS
would require translating Nostr identities into Supabase `auth.uid()`,
which adds complexity without a real security win in the hackathon
scope. If/when we expose direct PostgREST access to clients, revisit
this and add per-tenant policies keyed off a custom JWT claim.

## Encryption

`nwc_uri_encrypted` and `wapupay_api_token_encrypted` are AES-GCM
ciphertexts produced and consumed by the app, keyed by an env secret
(`ZAPLOOP_SECRETS_KEY`, 32 bytes base64). Postgres never sees the
plaintext. Rationale: avoids the Supabase Vault dependency and keeps
key rotation a single-env-var change.
