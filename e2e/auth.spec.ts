import { test, expect } from "@playwright/test";
import { PASSWORD, latestLink, login, register, uniqueEmail } from "./fixtures/helpers";

test.describe("registration, verification and login", () => {
  test("new accounts are gated until the email is confirmed", async ({ page }) => {
    const email = uniqueEmail("verify");
    await register(page, email);
    await expect(page.getByTestId("verify-banner")).toContainText(email);

    // A gated action is refused by the API with a clear message.
    const res = await page.request.post("/api/markets", { data: {} });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe("email_unverified");

    // Resend works and the outbox receives a verification link.
    await page.getByTestId("verify-banner").getByRole("button", { name: "Resend email" }).click();
    await expect(page.getByTestId("verify-banner")).toContainText("Email sent");

    const link = await latestLink(page.request, email, "verify_email");
    await page.goto(link);
    await expect(page.getByTestId("verify-ok")).toBeVisible();
    await page.goto("/overview");
    await expect(page.getByTestId("verify-banner")).toHaveCount(0);

    // The link is single-use.
    await page.goto(link);
    await expect(page.getByTestId("verify-error")).toContainText(/already been used/);
  });

  test("an older verification link is revoked when a new one is issued", async ({ page }) => {
    const email = uniqueEmail("revoke");
    await register(page, email);
    const first = await latestLink(page.request, email, "verify_email");
    await page.getByRole("button", { name: "Resend email" }).click();
    await expect(page.getByTestId("verify-banner")).toContainText("Email sent");
    await page.goto(first);
    await expect(page.getByTestId("verify-error")).toBeVisible();
  });

  test("login rejects wrong passwords and invalid links show a clear error", async ({ page }) => {
    const email = uniqueEmail("login");
    await register(page, email);
    await page.request.post("/api/auth/logout");
    await login(page, email, "wrong-password-1");
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
    await login(page, email);
    await page.waitForURL("**/markets");

    await page.goto("/verify-email?token=not-a-real-token");
    await expect(page.getByTestId("verify-error")).toContainText(/not valid/);
    await page.goto("/verify-email");
    await expect(page.getByTestId("verify-error")).toContainText(/needs the link/);
  });
});

test.describe("password reset", () => {
  test("reset link sets a new password, signs out other sessions, and cannot be reused", async ({ page, browser }) => {
    const email = uniqueEmail("reset");
    await register(page, email);
    // A second device with an active session.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await login(otherPage, email);
    await otherPage.waitForURL("**/markets");

    await page.request.post("/api/auth/logout");
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/If an account exists/)).toBeVisible();

    const link = await latestLink(page.request, email, "password_reset");
    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill("short");
    await page.getByLabel("Repeat new password").fill("short");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText(/at least 10 characters/i).first()).toBeVisible();

    const next = "N3w-Passw0rd-456";
    await page.getByLabel("New password", { exact: true }).fill(next);
    await page.getByLabel("Repeat new password").fill(next);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByTestId("reset-ok")).toBeVisible();

    // The other device was signed out.
    const me = await (await otherPage.request.get("/api/auth/me")).json();
    expect(me.data.user).toBeNull();
    await other.close();

    // Old password fails, new one works, and the reset also verified the email.
    await login(page, email, PASSWORD);
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
    await login(page, email, next);
    await page.waitForURL("**/markets");
    await expect(page.getByTestId("verify-banner")).toHaveCount(0);

    // Reuse is refused.
    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill("An0ther-Passw0rd");
    await page.getByLabel("Repeat new password").fill("An0ther-Passw0rd");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText(/already been used/)).toBeVisible();
  });

  test("forgot-password does not reveal whether an account exists", async ({ request }) => {
    const a = await (await request.post("/api/auth/forgot-password", { data: { email: uniqueEmail("nobody") } })).json();
    const email = uniqueEmail("exists");
    await request.post("/api/auth/register", { data: { name: "Exists", email, password: PASSWORD } });
    const b = await (await request.post("/api/auth/forgot-password", { data: { email } })).json();
    expect(a).toEqual(b);
  });
});

