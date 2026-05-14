// Persistence interface for Zaploop's operational state.
//
// We keep this layer abstract so the in-memory implementation used today
// can be swapped for the Postgres-backed one (see supabase/migrations/
// 0001_init.sql) without touching API routes or the billing worker.

export type Rail = "self" | "wapupay";
export type BillingInterval = "weekly" | "monthly" | "quarterly" | "yearly";
export type SubscriptionState = "active" | "past_due" | "canceled" | "paused";
export type ChargeState =
  | "scheduled"
  | "invoicing"
  | "awaiting_payment"
  | "paid"
  | "payout_pending"
  | "payout_complete"
  | "failed_invoice"
  | "failed_payment"
  | "failed_payout";

export type Subscription = {
  id: string;
  merchantPubkey: string; // author of the plan event
  planNaddr: string;
  planSlug: string;
  planName: string;
  planAmountSat: number;
  planInterval: BillingInterval;
  rail: Rail;
  subscriberPubkey: string;
  subscriberNwcUriEncrypted: string;
  state: SubscriptionState;
  currentPeriodStart: number; // unix seconds
  currentPeriodEnd: number;
  nextChargeAt: number | null;
  canceledAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type Charge = {
  id: string;
  subscriptionId: string;
  merchantPubkey: string;
  amountSat: number;
  rail: Rail;
  state: ChargeState;
  paymentHash: string | null;
  preimage: string | null;
  wapuDepositTxId: string | null;
  wapuPayoutTxId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  scheduledFor: number;
  paidAt: number | null;
  payoutCompletedAt: number | null;
  attempts: number;
  createdAt: number;
  updatedAt: number;
};

export type CreateSubscriptionInput = {
  merchantPubkey: string;
  planNaddr: string;
  planSlug: string;
  planName: string;
  planAmountSat: number;
  planInterval: BillingInterval;
  rail: Rail;
  subscriberPubkey: string;
  subscriberNwcUriEncrypted: string;
};

export interface SubscriptionStore {
  createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<{ subscription: Subscription; firstCharge: Charge }>;

  findActiveSubscription(
    planNaddr: string,
    subscriberPubkey: string,
  ): Promise<Subscription | null>;

  isMembershipActive(
    merchantPubkey: string,
    subscriberPubkey: string,
  ): Promise<{ active: boolean; subscription: Subscription | null }>;

  // Worker queries.
  findDueCharges(now: number, limit: number): Promise<Charge[]>;
  updateCharge(id: string, patch: Partial<Charge>): Promise<Charge | null>;
  updateSubscription(
    id: string,
    patch: Partial<Subscription>,
  ): Promise<Subscription | null>;

  // Diagnostics / dashboard.
  getSubscription(id: string): Promise<Subscription | null>;
  listSubscriptionsFor(
    merchantPubkey: string,
  ): Promise<Subscription[]>;
}
