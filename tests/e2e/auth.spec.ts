import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test.describe("Landing page", () => {
    test("shows hero section with correct content", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: /Send webhooks without the headache/i })
      ).toBeVisible();
      await expect(
        page.getByText("HookRelay is reliable webhook infrastructure")
      ).toBeVisible();
    });

    test("has navigation links to login and signup", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Login" })).toHaveAttribute(
        "href",
        "/login"
      );
      await expect(
        page.getByRole("link", { name: "Get Started" })
      ).toHaveAttribute("href", "/signup");
    });

    test("has CTA buttons for signup and docs", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.getByRole("link", { name: "Start for free" })
      ).toHaveAttribute("href", "/signup");
      await expect(
        page.getByRole("link", { name: "View docs" })
      ).toBeVisible();
    });

    test("shows code example section", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByText("curl -X POST")).toBeVisible();
      await expect(page.getByText("hr_your_api_key")).toBeVisible();
    });

    test("shows footer with copyright", async ({ page }) => {
      await page.goto("/");
      const year = new Date().getFullYear();
      await expect(
        page.getByText(`${year} HookRelay`)
      ).toBeVisible();
    });

    test("navigates to signup from CTA", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("link", { name: "Start for free" }).click();
      await expect(page).toHaveURL(/\/signup/);
      await expect(
        page.getByRole("heading", { name: "Create your account" })
      ).toBeVisible();
    });

    test("navigates to login from header", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("link", { name: "Login" }).click();
      await expect(page).toHaveURL(/\/login/);
      await expect(
        page.getByRole("heading", { name: "Welcome back" })
      ).toBeVisible();
    });
  });

  test.describe("Login page", () => {
    test("shows login page with heading and subtitle", async ({ page }) => {
      await page.goto("/login");
      await expect(
        page.getByRole("heading", { name: "Welcome back" })
      ).toBeVisible();
      await expect(
        page.getByText("Sign in to your HookRelay account")
      ).toBeVisible();
    });

    test("has email input field with correct attributes", async ({ page }) => {
      await page.goto("/login");
      const emailInput = page.locator("#email");
      await expect(emailInput).toHaveAttribute("type", "email");
      await expect(emailInput).toHaveAttribute("required");
      await expect(emailInput).toHaveAttribute(
        "placeholder",
        "you@company.com"
      );
    });

    test("has password input field with correct attributes", async ({
      page,
    }) => {
      await page.goto("/login");
      const passwordInput = page.locator("#password");
      await expect(passwordInput).toHaveAttribute("type", "password");
      await expect(passwordInput).toHaveAttribute("required");
    });

    test("has submit button", async ({ page }) => {
      await page.goto("/login");
      await expect(
        page.getByRole("button", { name: "Sign in" })
      ).toHaveAttribute("type", "submit");
    });

    test("has link to signup page", async ({ page }) => {
      await page.goto("/login");
      const signupLink = page.getByRole("link", { name: "Sign up" });
      await expect(signupLink).toHaveAttribute("href", "/signup");
    });

    test("navigates from login to signup", async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("link", { name: "Sign up" }).click();
      await expect(page).toHaveURL(/\/signup/);
      await expect(
        page.getByRole("heading", { name: "Create your account" })
      ).toBeVisible();
    });

    test("email field has associated label", async ({ page }) => {
      await page.goto("/login");
      const label = page.getByText("Email", { exact: true });
      await expect(label).toBeVisible();
      const forAttribute = await label.getAttribute("for");
      expect(forAttribute).toBe("email");
    });

    test("password field has associated label", async ({ page }) => {
      await page.goto("/login");
      const label = page.getByText("Password", { exact: true });
      await expect(label).toBeVisible();
      const forAttribute = await label.getAttribute("for");
      expect(forAttribute).toBe("password");
    });
  });

  test.describe("Signup page", () => {
    test("shows signup page with heading and subtitle", async ({ page }) => {
      await page.goto("/signup");
      await expect(
        page.getByRole("heading", { name: "Create your account" })
      ).toBeVisible();
      await expect(
        page.getByText("Start sending webhooks in minutes")
      ).toBeVisible();
    });

    test("has name input field", async ({ page }) => {
      await page.goto("/signup");
      const nameInput = page.locator("#name");
      await expect(nameInput).toHaveAttribute("type", "text");
      await expect(nameInput).toHaveAttribute("placeholder", "Jane Smith");
    });

    test("has email input field with correct attributes", async ({ page }) => {
      await page.goto("/signup");
      const emailInput = page.locator("#email");
      await expect(emailInput).toHaveAttribute("type", "email");
      await expect(emailInput).toHaveAttribute("required");
      await expect(emailInput).toHaveAttribute(
        "placeholder",
        "you@company.com"
      );
    });

    test("has password input field with min length validation", async ({
      page,
    }) => {
      await page.goto("/signup");
      const passwordInput = page.locator("#password");
      await expect(passwordInput).toHaveAttribute("type", "password");
      await expect(passwordInput).toHaveAttribute("required");
      await expect(passwordInput).toHaveAttribute("minlength", "8");
    });

    test("has submit button", async ({ page }) => {
      await page.goto("/signup");
      await expect(
        page.getByRole("button", { name: "Create account" })
      ).toHaveAttribute("type", "submit");
    });

    test("has link to login page", async ({ page }) => {
      await page.goto("/signup");
      const loginLink = page.getByRole("link", { name: "Sign in" });
      await expect(loginLink).toHaveAttribute("href", "/login");
    });

    test("navigates from signup to login", async ({ page }) => {
      await page.goto("/signup");
      await page.getByRole("link", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/login/);
      await expect(
        page.getByRole("heading", { name: "Welcome back" })
      ).toBeVisible();
    });

    test("has all three form fields", async ({ page }) => {
      await page.goto("/signup");
      await expect(page.locator("#name")).toBeVisible();
      await expect(page.locator("#email")).toBeVisible();
      await expect(page.locator("#password")).toBeVisible();
    });

    test("name field has associated label", async ({ page }) => {
      await page.goto("/signup");
      const label = page.getByText("Name", { exact: true });
      await expect(label).toBeVisible();
      const forAttribute = await label.getAttribute("for");
      expect(forAttribute).toBe("name");
    });
  });

  test.describe("Forgot password page", () => {
    test("shows forgot password page with heading", async ({ page }) => {
      await page.goto("/forgot-password");
      await expect(
        page.getByRole("heading", { name: "Reset your password" })
      ).toBeVisible();
      await expect(
        page.getByText("Enter your email and we'll send you a reset link")
      ).toBeVisible();
    });

    test("has email input field", async ({ page }) => {
      await page.goto("/forgot-password");
      const emailInput = page.locator("#email");
      await expect(emailInput).toHaveAttribute("type", "email");
      await expect(emailInput).toHaveAttribute("required");
      await expect(emailInput).toHaveAttribute(
        "placeholder",
        "you@company.com"
      );
    });

    test("has submit button", async ({ page }) => {
      await page.goto("/forgot-password");
      await expect(
        page.getByRole("button", { name: "Send reset link" })
      ).toHaveAttribute("type", "submit");
    });
  });

  test.describe("Auth navigation flow", () => {
    test("complete navigation: landing -> signup -> login -> forgot-password", async ({
      page,
    }) => {
      await page.goto("/");

      await page.getByRole("link", { name: "Get Started" }).click();
      await expect(page).toHaveURL(/\/signup/);

      await page.getByRole("link", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/login/);

      await page.goto("/forgot-password");
      await expect(
        page.getByRole("heading", { name: "Reset your password" })
      ).toBeVisible();
    });

    test("can navigate back from login to landing via browser back", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByRole("link", { name: "Login" }).click();
      await expect(page).toHaveURL(/\/login/);
      await page.goBack();
      await expect(page).toHaveURL(/\//);
      await expect(
        page.getByText("Send webhooks without the headache")
      ).toBeVisible();
    });
  });
});
