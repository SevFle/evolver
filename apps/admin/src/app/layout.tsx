import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShipLens Admin",
  description: "Manage shipments, tenants, and notifications",
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
