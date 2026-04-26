export default function EndpointsPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Endpoints</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your webhook destination endpoints
          </p>
        </div>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Add endpoint
        </button>
      </div>
      <div className="mt-8 rounded-lg border">
        <div className="p-8 text-center text-muted-foreground">
          No endpoints yet. Create your first endpoint to start sending webhooks.
        </div>
      </div>
    </div>
  );
}
