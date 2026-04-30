import Link from "next/link";

const navItems = [
  { href: "/deliveries" as const, label: "Dashboard" },
  { href: "/endpoints" as const, label: "Endpoints" },
  { href: "/events" as const, label: "Events" },
  { href: "/analytics" as const, label: "Analytics" },
  { href: "/settings" as const, label: "Settings" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-muted/30">
        <div className="p-6">
          <Link href="/" className="text-xl font-bold">
            HookRelay
          </Link>
        </div>
        <nav className="space-y-1 px-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl p-8">{children}</div>
      </main>
    </div>
  );
}
