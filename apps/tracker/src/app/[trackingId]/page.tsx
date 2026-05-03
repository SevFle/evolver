import { redirect } from "next/navigation";

interface OldTrackingPageProps {
  params: Promise<{ trackingId: string }>;
}

export default async function OldTrackingPage({ params }: OldTrackingPageProps) {
  const { trackingId } = await params;
  redirect(`/track/${encodeURIComponent(trackingId)}`);
}
