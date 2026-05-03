import { redirect, notFound } from "next/navigation";
import { isValidTrackingId } from "@/lib/tracking-id-validation";

interface OldTrackingPageProps {
  params: Promise<{ trackingId: string }>;
}

export default async function OldTrackingPage({ params }: OldTrackingPageProps) {
  const { trackingId } = await params;
  if (!isValidTrackingId(trackingId)) {
    notFound();
  }
  redirect(`/track/${trackingId}`);
}
