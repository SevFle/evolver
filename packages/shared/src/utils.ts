export function generateTrackingId(): string {
  const prefix = "SL";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatApiResponse<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

export function formatApiError(error: string, status?: number): { success: false; error: string; status?: number } {
  return { success: false, error, status };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  return /^\+?[1-9]\d{6,14}$/.test(phone.replace(/[\s\-()]/g, ""));
}
