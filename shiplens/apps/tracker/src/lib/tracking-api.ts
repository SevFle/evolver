const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function fetchTrackingData(trackingId: string) {
  const response = await fetch(`${API_BASE_URL}/api/shipments/${trackingId}`, {
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch tracking data: ${response.statusText}`);
  }

  return response.json();
}
