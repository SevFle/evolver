export default async function TrackingPage({
  params,
}: {
  params: Promise<{ trackingId: string }>;
}) {
  const { trackingId } = await params;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-12 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Shipment Tracking
        </h1>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">
            Tracking ID: <span className="font-mono font-semibold">{trackingId}</span>
          </p>
          <p className="text-sm text-gray-400 mt-4">
            Shipment details will appear here once connected to the API.
          </p>
        </div>
      </div>
    </main>
  );
}
