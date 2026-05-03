import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthProvider, useAuth, decodeJwtPayload, extractUser } from "@/lib/auth-context";

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

function Consumer() {
  const { token, user, isAuthenticated, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="token">{token ?? "null"}</span>
      <span data-testid="tenant-id">{user?.tenantId ?? "null"}</span>
      <span data-testid="is-auth">{String(isAuthenticated)}</span>
      <button onClick={() => login(makeJwt({ tenantId: "t-1", email: "a@b.com" }))}>
        login
      </button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts unauthenticated with no stored token", () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    expect(screen.getByTestId("token").textContent).toBe("null");
    expect(screen.getByTestId("tenant-id").textContent).toBe("null");
    expect(screen.getByTestId("is-auth").textContent).toBe("false");
  });

  it("restores token from localStorage on mount", () => {
    const jwt = makeJwt({ tenantId: "restored-tenant" });
    localStorage.setItem("shiplens_auth_token", jwt);

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    expect(screen.getByTestId("token").textContent).toBe(jwt);
    expect(screen.getByTestId("tenant-id").textContent).toBe("restored-tenant");
    expect(screen.getByTestId("is-auth").textContent).toBe("true");
  });

  it("clears invalid stored token on mount", () => {
    localStorage.setItem("shiplens_auth_token", "not-a-jwt");

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    expect(screen.getByTestId("token").textContent).toBe("null");
    expect(localStorage.getItem("shiplens_auth_token")).toBeNull();
  });

  it("login sets token and user", () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    fireEvent.click(screen.getByText("login"));

    expect(screen.getByTestId("is-auth").textContent).toBe("true");
    expect(screen.getByTestId("tenant-id").textContent).toBe("t-1");
    const stored = localStorage.getItem("shiplens_auth_token");
    expect(stored).not.toBeNull();
    const decoded = JSON.parse(atob(stored!.split(".")[1]));
    expect(decoded.tenantId).toBe("t-1");
  });

  it("logout clears token and user", () => {
    const jwt = makeJwt({ tenantId: "t-1" });
    localStorage.setItem("shiplens_auth_token", jwt);

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    expect(screen.getByTestId("is-auth").textContent).toBe("true");

    fireEvent.click(screen.getByText("logout"));

    expect(screen.getByTestId("is-auth").textContent).toBe("false");
    expect(screen.getByTestId("token").textContent).toBe("null");
    expect(localStorage.getItem("shiplens_auth_token")).toBeNull();
  });

  it("login ignores invalid JWT", () => {
    function BadLoginConsumer() {
      const { login, isAuthenticated } = useAuth();
      return (
        <div>
          <span data-testid="is-auth">{String(isAuthenticated)}</span>
          <button onClick={() => login("not-valid-jwt")}>bad-login</button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <BadLoginConsumer />
      </AuthProvider>
    );

    fireEvent.click(screen.getByText("bad-login"));
    expect(screen.getByTestId("is-auth").textContent).toBe("false");
  });

  it("useAuth throws outside AuthProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      render(<Consumer />);
    }).toThrow("useAuth must be used within AuthProvider");
    spy.mockRestore();
  });
});

describe("decodeJwtPayload", () => {
  it("decodes a valid JWT payload", () => {
    const jwt = makeJwt({ tenantId: "abc", role: "admin" });
    const payload = decodeJwtPayload(jwt);
    expect(payload).toEqual({ tenantId: "abc", role: "admin" });
  });

  it("returns null for invalid JWT", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("")).toBeNull();
    expect(decodeJwtPayload("a.b")).toBeNull();
  });
});

describe("extractUser", () => {
  it("extracts user from valid JWT", () => {
    const jwt = makeJwt({ tenantId: "t-99", email: "x@y.com" });
    const user = extractUser(jwt);
    expect(user).toEqual({ tenantId: "t-99", email: "x@y.com", role: undefined });
  });

  it("returns null if tenantId missing", () => {
    const jwt = makeJwt({ email: "x@y.com" });
    expect(extractUser(jwt)).toBeNull();
  });

  it("returns null for invalid JWT", () => {
    expect(extractUser("invalid")).toBeNull();
  });
});
