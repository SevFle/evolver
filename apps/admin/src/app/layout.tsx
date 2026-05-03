import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { TopNav } from "@/components/TopNav";

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
      <body>
        <AuthProvider>
          <TopNav />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
