import { randomUUID } from "node:crypto";
import { addInterval } from "@/lib/billing/interval";
import type {
  Charge,
  CreateSubscriptionInput,
  Subscription,
  SubscriptionStore,
} from "./types";

// In-memory implementation. Survives within a single Node process — fine
// for local dev and for validating the API surface, but does NOT span
// Vercel serverless invocations. Swap with a Postgres-backed store
// before any persistent claim works in production.

export class MemoryStore implements SubscriptionStore {
  private subscriptions = new Map<string, Subscription>();
  private charges = new Map<string, Charge>();

  async createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<{ subscription: Subscription; firstCharge: Charge }> {
    const existing = await this.findActiveSubscription(
      input.planNaddr,
      input.subscriberPubkey,
    );
    if (existing) {
      throw Object.assign(new Error("already subscribed"), {
        code: "already_subscribed",
        subscriptionId: existing.id,
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const periodEnd = addInterval(now, input.planInterval);

    const subscription: Subscription = {
      id: randomUUID(),
      merchantPubkey: input.merchantPubkey,
      planNaddr: input.planNaddr,
      planSlug: input.planSlug,
      planName: input.planName,
      planAmountSat: input.planAmountSat,
      planInterval: input.planInterval,
      rail: input.rail,
      subscriberPubkey: input.subscriberPubkey,
      subscriberNwcUriEncrypted: input.subscriberNwcUriEncrypted,
      state: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      nextChargeAt: now, // first charge runs immediately
      canceledAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const firstCharge: Charge = {
      id: randomUUID(),
      subscriptionId: subscription.id,
      merchantPubkey: subscription.merchantPubkey,
      amountSat: subscription.planAmountSat,
      rail: subscription.rail,
      state: "scheduled",
      paymentHash: null,
      preimage: null,
      wapuDepositTxId: null,
      wapuPayoutTxId: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      scheduledFor: now,
      paidAt: null,
      payoutCompletedAt: null,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.subscriptions.set(subscription.id, subscription);
    this.charges.set(firstCharge.id, firstCharge);
    return { subscription, firstCharge };
  }

  async findActiveSubscription(
    planNaddr: string,
    subscriberPubkey: string,
  ): Promise<Subscription | null> {
    for (const s of this.subscriptions.values()) {
      if (
        s.planNaddr === planNaddr &&
        s.subscriberPubkey === subscriberPubkey &&
        s.state === "active"
      ) return s;
    }
    return null;
  }

  async isMembershipActive(
    merchantPubkey: string,
    subscriberPubkey: string,
  ): Promise<{ active: boolean; subscription: Subscription | null }> {
    const now = Math.floor(Date.now() / 1000);
    for (const s of this.subscriptions.values()) {
      if (
        s.merchantPubkey === merchantPubkey &&
        s.subscriberPubkey === subscriberPubkey &&
        s.state === "active" &&
        s.currentPeriodEnd > now
      ) {
        return { active: true, subscription: s };
      }
    }
    return { active: false, subscription: null };
  }

  async findDueCharges(now: number, limit: number): Promise<Charge[]> {
    const out: Charge[] = [];
    for (const c of this.charges.values()) {
      if (
        (c.state === "scheduled" ||
          c.state === "invoicing" ||
          c.state === "awaiting_payment" ||
          c.state === "payout_pending") &&
        c.scheduledFor <= now
      ) {
        out.push(c);
        if (out.length >= limit) break;
      }
    }
    return out.sort((a, b) => a.scheduledFor - b.scheduledFor);
  }

  async updateCharge(id: string, patch: Partial<Charge>): Promise<Charge | null> {
    const existing = this.charges.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: Math.floor(Date.now() / 1000) };
    this.charges.set(id, updated);
    return updated;
  }

  async updateSubscription(
    id: string,
    patch: Partial<Subscription>,
  ): Promise<Subscription | null> {
    const existing = this.subscriptions.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...patch,
      updatedAt: Math.floor(Date.now() / 1000),
    };
    this.subscriptions.set(id, updated);
    return updated;
  }

  async getSubscription(id: string): Promise<Subscription | null> {
    return this.subscriptions.get(id) ?? null;
  }

  async listSubscriptionsFor(merchantPubkey: string): Promise<Subscription[]> {
    return Array.from(this.subscriptions.values()).filter(
      (s) => s.merchantPubkey === merchantPubkey,
    );
  }
}
