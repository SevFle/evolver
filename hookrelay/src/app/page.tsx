import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold">HookRelay</h1>
          <nav className="flex gap-4">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h2 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Send webhooks{" "}
          <span className="text-primary">without the headache</span>
        </h2>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          HookRelay is reliable webhook infrastructure for SaaS teams. One API
          call, and we handle signed delivery, retries, logging, and alerting.
        </p>
        <div className="mt-10 flex gap-4">
          <Link
            href="/signup"
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground"
          >
            Start for free
          </Link>
          <Link
            href="#"
            className="rounded-md border px-6 py-3 font-medium"
          >
            View docs
          </Link>
        </div>
        <div className="mt-16 w-full max-w-2xl">
          <div className="rounded-lg border bg-muted/50 p-6">
            <code className="text-sm">
              <span className="text-muted-foreground">$</span> curl -X POST
              https://api.hookrelay.com/v1/events \<br />
              &nbsp;&nbsp;-H &quot;Authorization: Bearer hr_your_api_key&quot;
              \<br />
              &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br />
              &nbsp;&nbsp;-d &#123;&quot;endpointId&quot;:
              &quot;...&quot;, &quot;eventType&quot;: &quot;order.created&quot;,
              &quot;payload&quot;: &#123;&#125;&#125;
            </code>
          </div>
        </div>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} HookRelay. Reliable webhooks, zero
        hassle.
      </footer>
    </div>
  );
}
