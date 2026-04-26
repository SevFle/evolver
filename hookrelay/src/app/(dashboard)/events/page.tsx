export default function EventsPage() {
  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold">Events</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and inspect all webhook events
        </p>
      </div>
      <div className="mt-8 rounded-lg border">
        <div className="p-8 text-center text-muted-foreground">
          No events yet. Send your first event via the API.
        </div>
      </div>
    </div>
  );
}
