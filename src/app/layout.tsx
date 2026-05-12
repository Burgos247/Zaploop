import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zaploop — Suscripciones en Lightning para tu negocio",
  description:
    "Cobrá suscripciones recurrentes en Bitcoin. Tus clientes pagan con su wallet, vos recibís sats directo o pesos en tu cuenta. Sin Stripe, sin tarjetas, sin chargebacks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
