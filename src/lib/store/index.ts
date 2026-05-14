import "server-only";
import { MemoryStore } from "./memory";
import type { SubscriptionStore } from "./types";

// Single process-wide store. Cached on globalThis so Next.js HMR reloads
// in dev don't reset the data between edits.

const g = globalThis as unknown as { __zaploopStore?: SubscriptionStore };
if (!g.__zaploopStore) g.__zaploopStore = new MemoryStore();

export const store: SubscriptionStore = g.__zaploopStore;
export type { SubscriptionStore } from "./types";
