export default function DeliveriesPage() {
  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold">Deliveries</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor webhook delivery status and retry failed deliveries
        </p>
      </div>
      <div className="mt-8 rounded-lg border">
        <div className="p-8 text-center text-muted-foreground">
          No deliveries yet.
        </div>
      </div>
    </div>
  );
}
