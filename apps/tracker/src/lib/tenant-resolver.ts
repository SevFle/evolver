import { headers } from "next/headers";

export async function resolveTenantFromHost() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const subdomain = host.split(".")[0];

  if (!subdomain || subdomain === "www" || subdomain === "track") {
    return null;
  }

  return subdomain;
}
