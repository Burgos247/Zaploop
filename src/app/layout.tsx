import type { Metadata } from "next";
import "./globals.css";
import { SignerBoot } from "@/components/nostr/SignerBoot";

const SITE_URL = "https://zaploop.vercel.app";
const SITE_TITLE = "Zaploop — Suscripciones en Lightning para tu negocio";
const SITE_DESCRIPTION =
  "Cobrá suscripciones recurrentes en Bitcoin. Tus clientes pagan con su wallet, vos recibís sats directo o pesos en tu cuenta. Sin Stripe, sin tarjetas, sin chargebacks.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s · Zaploop" },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "Zaploop",
    locale: "es_AR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        <SignerBoot />
        {children}
      </body>
    </html>
  );
}
