const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

let authToken: string | null = null;
let csrfToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function clearSession(): void {
  authToken = null;
  csrfToken = null;
}

export function hasValidSession(): boolean {
  return authToken !== null;
}

function buildHeaders(options: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (authToken) {
    headers["authorization"] = `Bearer ${authToken}`;
  }

  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
  }

  if (options.headers) {
    const incoming = options.headers as Record<string, string>;
    for (const [key, value] of Object.entries(incoming)) {
      headers[key.toLowerCase()] = value;
    }
  }

  return headers;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = buildHeaders(options);

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearSession();
  }

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
