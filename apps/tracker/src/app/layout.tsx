import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Track Your Shipment — ShipLens",
  description: "Real-time shipment tracking powered by ShipLens",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
