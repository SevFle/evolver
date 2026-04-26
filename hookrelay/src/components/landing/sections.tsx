export function HeroSection() {
  return (
    <section className="py-20 text-center">
      <h2 className="text-4xl font-bold tracking-tight sm:text-6xl">
        Reliable webhooks,{" "}
        <span className="text-primary">zero infrastructure</span>
      </h2>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
        Send one API call. We handle signed delivery, retries, logging, and
        alerting. Focus on your product, not plumbing.
      </p>
    </section>
  );
}

export function FeaturesSection() {
  const features = [
    {
      title: "Cryptographic Signatures",
      description:
        "Every payload is HMAC-SHA256 signed so your customers can verify authenticity.",
    },
    {
      title: "Exponential Backoff Retries",
      description:
        "Automatic retries with configurable schedules. Failed deliveries get multiple chances.",
    },
    {
      title: "Real-time Event Log",
      description:
        "Inspect every payload, response, and header. Debug delivery issues in seconds.",
    },
    {
      title: "Circuit Breaking",
      description:
        "Auto-disable failing endpoints before they cause cascading problems.",
    },
  ];

  return (
    <section className="py-20">
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f.title} className="rounded-lg border p-6">
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {f.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
