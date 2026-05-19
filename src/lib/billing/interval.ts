export type BillingInterval = "weekly" | "monthly" | "quarterly" | "yearly";

// Approximate day-based steps. Calendar-accurate logic (month boundaries,
// leap years) is out of scope for the hackathon.
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
