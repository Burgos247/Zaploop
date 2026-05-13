-- Zaploop initial schema. Models the two-rail billing architecture
-- decided after the Wapupay API spike (see spike/notes.md).
--
-- Multi-tenant: every plan/subscription/charge carries tenant_id.
-- Auth is Nostr (pubkey hex). RLS is intentionally NOT enabled — all
-- DB access is mediated by the Next.js server with the service_role
-- key, after server-side verification of the NIP-07/NIP-46 signature.
-- Revisit RLS if we ever expose direct PostgREST access to clients.

create extension if not exists pgcrypto;

-- ─── Enums ────────────────────────────────────────────────────────────

create type billing_interval as enum ('weekly', 'monthly', 'quarterly', 'yearly');

-- Which rail is used to *receive* the payment.
--   self    → invoice generated via merchant's own NWC make_invoice.
--             Sats land in the merchant's wallet. Custody-less.
--   wapupay → invoice generated via Wapupay's deposit_lightning.
--             Sats become USDT in merchant's Wapu balance (shown as ARS).
--             Optional auto-payout to CBU via fiat_transfer.
create type charge_rail as enum ('self', 'wapupay');

create type subscription_state as enum ('active', 'past_due', 'canceled', 'paused');

-- Charge state machine — matches the one validated in spike/billing-cycle.mjs.
create type charge_state as enum (
  'scheduled',
  'invoicing',
  'awaiting_payment',
  'paid',
  'payout_pending',     -- wapupay rail only
  'payout_complete',    -- wapupay rail only
  'failed_invoice',
  'failed_payment',
  'failed_payout'       -- wapupay rail only
);

-- ─── Tenants (merchants) ──────────────────────────────────────────────
-- A tenant is owned by one Nostr pubkey. Co-ownership / teams are out
-- of scope for the hackathon.

create table tenants (
  id                            uuid primary key default gen_random_uuid(),
  slug                          text not null unique,
  display_name                  text not null,
  owner_pubkey                  text not null,       -- 64-char hex
  -- Self-rail credentials (merchant's receiving NWC). Encrypted app-side
  -- with AES-GCM using a server env secret; ciphertext stored here.
  nwc_uri_encrypted             text,
  -- Wapupay-rail credentials (merchant's Wapupay API token).
  wapupay_api_token_encrypted   text,
  wapupay_payout_pct            integer not null default 0
                                check (wapupay_payout_pct between 0 and 100),
  wapupay_payout_alias          text,                -- CBU or alias
  wapupay_payout_receiver_name  text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create unique index tenants_owner_pubkey_idx on tenants(owner_pubkey);

comment on column tenants.nwc_uri_encrypted is
  'AES-GCM ciphertext of nostr+walletconnect:// URI. Decrypted in the worker only.';
comment on column tenants.wapupay_payout_pct is
  'Percentage of each Wapupay-rail charge auto-transferred to wapupay_payout_alias. 0 = no auto-payout.';

-- ─── Plans ────────────────────────────────────────────────────────────
-- A plan is a (amount, interval, rail) tuple. Rail lives on the plan so
-- one tenant can offer both rails in parallel.

create table plans (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  slug          text not null,
  name          text not null,
  description   text,
  amount_sat    bigint not null check (amount_sat > 0),
  billing_interval billing_interval not null,
  rail          charge_rail not null,
  active        boolean not null default true,
  -- NIP-58 badge naddr minted on first activation. Same badge gets
  -- (re)issued on every renewal — we store the naddr only.
  badge_naddr   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index plans_tenant_id_idx on plans(tenant_id);
create index plans_active_idx on plans(tenant_id) where active;

-- ─── Subscriptions ────────────────────────────────────────────────────
-- A subscriber's standing relationship with one plan. The subscriber's
-- NWC URI is captured here (not on the user, because the same person
-- can authorize different wallets per subscription).

create table subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references tenants(id) on delete cascade,
  plan_id                uuid not null references plans(id) on delete restrict,
  subscriber_pubkey      text not null,
  nwc_uri_encrypted      text not null,             -- subscriber's pay_invoice URI
  state                  subscription_state not null default 'active',
  current_period_start   timestamptz not null,
  current_period_end     timestamptz not null,
  -- Convenience pointer for the billing worker. Same as current_period_end
  -- when active; null when canceled/paused.
  next_charge_at         timestamptz,
  canceled_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index subscriptions_subscriber_idx on subscriptions(subscriber_pubkey);
-- The worker scans this index to find what to charge next.
create index subscriptions_due_idx on subscriptions(next_charge_at)
  where state = 'active' and next_charge_at is not null;
-- One active subscription per (plan, subscriber). Canceled rows are kept
-- for history, so this is a partial unique.
create unique index subscriptions_active_unique
  on subscriptions(plan_id, subscriber_pubkey)
  where state = 'active';

-- ─── Charges ──────────────────────────────────────────────────────────
-- One row per billing attempt. The first charge of a subscription is
-- inserted at subscription creation with scheduled_for = now(), so the
-- worker handles "initial" and "recurring" with the same code path.

create table charges (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  subscription_id       uuid not null references subscriptions(id) on delete cascade,
  state                 charge_state not null default 'scheduled',
  rail                  charge_rail not null,
  amount_sat            bigint not null check (amount_sat > 0),
  -- Self rail: invoice payment hash (idempotency on retry) + preimage on success.
  payment_hash          text,
  preimage              text,
  -- Wapupay rail: deposit transaction id (poll target) + payout tx id.
  wapu_deposit_tx_id    text,
  wapu_payout_tx_id     text,
  -- Last error captured per the NIP-47 codes / Wapu error envelope.
  last_error_code       text,
  last_error_message    text,
  -- Lifecycle timestamps.
  scheduled_for         timestamptz not null,
  paid_at               timestamptz,
  payout_completed_at   timestamptz,
  attempts              integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Worker picks up rows in these states ordered by scheduled_for.
create index charges_worker_idx on charges(state, scheduled_for)
  where state in ('scheduled','invoicing','awaiting_payment','payout_pending');

-- Idempotency. We must not double-create an invoice for the same charge.
create unique index charges_payment_hash_idx
  on charges(payment_hash) where payment_hash is not null;
create unique index charges_wapu_deposit_idx
  on charges(wapu_deposit_tx_id) where wapu_deposit_tx_id is not null;

create index charges_subscription_idx on charges(subscription_id, scheduled_for desc);

-- ─── updated_at trigger ───────────────────────────────────────────────

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tenants_set_updated_at
  before update on tenants
  for each row execute function set_updated_at();

create trigger plans_set_updated_at
  before update on plans
  for each row execute function set_updated_at();

create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();

create trigger charges_set_updated_at
  before update on charges
  for each row execute function set_updated_at();
