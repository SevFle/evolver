function extractTenantFromHost(host: string | null): string | null {
  if (!host) return null;
  const parts = host.split(".");
  if (parts.length >= 3 && parts[parts.length - 2] === "trackshiplens") {
    return parts[0];
  }
  return null;
}

function extractTenantFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/t\/([a-z0-9-]+)/);
  return match?.[1] ?? null;
}

export function resolveTenant(host: string | null, pathname: string): string | null {
  return extractTenantFromHost(host) ?? extractTenantFromPath(pathname);
}
