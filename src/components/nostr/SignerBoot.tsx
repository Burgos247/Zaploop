"use client";

import { useEffect } from "react";
import { restoreLocalSigner } from "@/lib/nostr/local-signer";

// Mounted once near the top of the layout. Re-installs the
// localStorage-backed Nostr shim before any user-triggered signEvent
// runs, so /app and /p/[naddr] work without a NIP-07 extension.
export function SignerBoot() {
  useEffect(() => {
    restoreLocalSigner();
  }, []);
  return null;
}
