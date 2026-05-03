const DANGEROUS_PROTOCOLS = /^(javascript:|data:|vbscript:)/i;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function sanitizeSupportUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (DANGEROUS_PROTOCOLS.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function validateContactEmail(
  email: string | null | undefined
): string | null {
  if (!email) return null;
  if (!EMAIL_REGEX.test(email)) return null;
  return email;
}

export function validateLogoUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}
