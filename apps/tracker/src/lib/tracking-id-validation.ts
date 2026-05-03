const TRACKING_ID_PATTERN = /^[A-Z]{2}-[A-Z0-9]{4,12}$/i;

export function isValidTrackingId(id: string): boolean {
  return TRACKING_ID_PATTERN.test(id);
}
