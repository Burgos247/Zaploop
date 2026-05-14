import type { BillingInterval } from "@/lib/store/types";

// Approximate day-based steps. Calendar-accurate logic (month boundaries,
// leap years) belongs in the Postgres-backed store once it lands.
const DAYS: Record<BillingInterval, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  yearly: 365,
};

export function addInterval(
  fromUnixSeconds: number,
  interval: BillingInterval,
): number {
  return fromUnixSeconds + DAYS[interval] * 24 * 60 * 60;
}
