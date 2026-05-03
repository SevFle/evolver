interface ShipmentHeaderProps {
  trackingId: string;
  status: string;
  origin?: string;
  destination?: string;
  carrierName?: string;
}

export function ShipmentHeader({
  trackingId,
  status,
  origin,
  destination,
  carrierName,
}: ShipmentHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-900">{trackingId}</h2>
        <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
          {status.replace(/_/g, " ")}
        </span>
      </div>
      <div className="flex gap-4 text-sm text-gray-600">
        {origin && <span>From: {origin}</span>}
        {destination && <span>To: {destination}</span>}
        {carrierName && <span>Carrier: {carrierName}</span>}
      </div>
    </div>
  );
}
