const TRACKING_ID_REGEX = /^[A-Z]{2}-[A-Z0-9]{4,12}$/;

export function isValidTrackingId(trackingId: string): boolean {
  return TRACKING_ID_REGEX.test(trackingId);
}
