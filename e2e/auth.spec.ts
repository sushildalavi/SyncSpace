import { PASSWORD, contextOptions, expect, formAlert, test, latestEmail, newUser, registerAndSignIn, signIn, signUp, verifyEmail } from "./support/helpers";

test.describe("email and password", () => {
  test("registers, must verify, then signs in and lands on the dashboard", async ({ page }) => {
    const user = newUser("Ada");
    await signUp(page, user);

    // Unverified accounts can't sign in yet and get a clear explanation.
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(formAlert(page)).toContainText("Confirm your email address first");

    await verifyEmail(page, user);
    await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
    await signIn(page, user);
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  });

  test("shows field errors without clearing what was typed", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter your name")).toBeVisible();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText("Use at least 10 characters").first()).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue("not-an-email");
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  });

  test("rejects invalid credentials with an actionable message", async ({ page }) => {
    const user = await registerAndSignIn(page, "Bob");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL(/\/sign-in/);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(formAlert(page)).toContainText("don't match");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("password show/hide toggle works", async ({ page }) => {
    await page.goto("/sign-in");
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("secret-value");
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("session persists across reloads and logout ends it", async ({ page }) => {
    await registerAndSignIn(page, "Cleo");
    await page.reload();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL(/\/sign-in/);
    await page.goto("/");
    await page.waitForURL(/\/sign-in\?next|\/sign-in$/);
    const me = await page.request.get("http://localhost:3101/me");
    expect(me.status()).toBe(401);
  });

  test("protected pages redirect to sign-in and return to the intended page afterwards", async ({ page }) => {
    const user = newUser("Dan");
    await signUp(page, user);
    await verifyEmail(page, user);
    await page.context().clearCookies(); // confirming the address signs you in, so start signed out
    await page.goto("/settings/appearance");
    await page.waitForURL(/\/sign-in\?next=%2Fsettings%2Fappearance/);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/settings\/appearance$/);
  });

  test("open-redirect attempts in ?next are ignored", async ({ page }) => {
    const user = newUser("Eve");
    await signUp(page, user);
    await verifyEmail(page, user);
    await page.context().clearCookies();
    await page.goto("/sign-in?next=//evil.example/steal");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    expect(new URL(page.url()).origin).toBe("http://localhost:3100");
  });
});

test.describe("password recovery", () => {
  test("resets a forgotten password, revokes old sessions and accepts the new password", async ({ page, browser }) => {
    const user = await registerAndSignIn(page, "Fay");
    // A second device that must be signed out by the reset.
    const other = await browser.newContext(contextOptions());
    const otherPage = await other.newPage();
    await signIn(otherPage, user);
    await expect(otherPage.getByRole("button", { name: "Account menu" })).toBeVisible();

    const fresh = await browser.newContext(contextOptions());
    const freshPage = await fresh.newPage();
    await freshPage.goto("/forgot-password");
    await freshPage.getByLabel("Email").fill(user.email);
    await freshPage.getByRole("button", { name: "Send reset link" }).click();
    await expect(freshPage.getByRole("status")).toContainText("a reset link is on its way");

    const mail = await latestEmail(freshPage.request, user.email, "Reset your SyncSpace password");
    await freshPage.goto(mail.links.find((link) => link.includes("reset-password"))!);
    await freshPage.waitForURL(/\/reset-password\?token=/);
    await freshPage.getByLabel("New password", { exact: true }).fill("a-brand-new-password-1");
    await freshPage.getByLabel("Confirm new password").fill("a-brand-new-password-1");
    await freshPage.getByRole("button", { name: "Update password" }).click();
    await freshPage.waitForURL(/\/sign-in\?reset=1/);
    await expect(freshPage.getByRole("status")).toContainText("Your password was updated");

    // old password no longer works, new one does
    await freshPage.getByLabel("Email").fill(user.email);
    await freshPage.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await freshPage.getByRole("button", { name: "Sign in" }).click();
    await expect(formAlert(freshPage)).toContainText("don't match");
    await freshPage.getByLabel("Password", { exact: true }).fill("a-brand-new-password-1");
    await freshPage.getByRole("button", { name: "Sign in" }).click();
    await expect(freshPage.getByRole("button", { name: "Account menu" })).toBeVisible();

    // the earlier sessions were revoked by the reset
    const stale = await page.request.get("http://localhost:3101/me");
    expect(stale.status()).toBe(401);
    // the reset link only works once
    await freshPage.goto(mail.links.find((link) => link.includes("reset-password"))!);
    await expect(freshPage.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  });

  test("does not reveal whether an email has an account", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("nobody-here@example.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("If an account exists");
  });
});

test.describe("sessions", () => {
  test("lists devices, and revoking one signs that device out", async ({ page, browser }) => {
    const user = await registerAndSignIn(page, "Gus");
    const other = await browser.newContext(contextOptions());
    const otherPage = await other.newPage();
    await signIn(otherPage, user);
    await expect(otherPage.getByRole("button", { name: "Account menu" })).toBeVisible();

    await page.goto("/settings/security");
    await expect(page.getByText("This device")).toBeVisible();
    const rows = page.getByRole("region", { name: "Active sessions" }).getByRole("listitem");
    await expect(rows.first()).toBeVisible();
    const before = await rows.count();
    expect(before).toBeGreaterThanOrEqual(2);
    // sign out every session that isn't this device, one row at a time
    for (let remaining = before; remaining > 1; remaining -= 1) {
      await rows.filter({ hasNotText: "This device" }).first().getByRole("button", { name: "Sign out" }).click();
      await expect(rows).toHaveCount(remaining - 1);
    }

    await otherPage.reload();
    await otherPage.waitForURL(/\/sign-in/);
  });

  test("'Sign out everywhere' revokes every session including this one", async ({ page, browser }) => {
    const user = await registerAndSignIn(page, "Hana");
    const other = await browser.newContext(contextOptions());
    const otherPage = await other.newPage();
    await signIn(otherPage, user);
    await expect(otherPage.getByRole("button", { name: "Account menu" })).toBeVisible();

    await page.goto("/settings/security");
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await page.waitForURL(/\/sign-in/);
    await otherPage.reload();
    await otherPage.waitForURL(/\/sign-in/);
  });

  test("changing the password signs out other devices", async ({ page, browser }) => {
    const user = await registerAndSignIn(page, "Ivy");
    const other = await browser.newContext(contextOptions());
    const otherPage = await other.newPage();
    await signIn(otherPage, user);
    await expect(otherPage.getByRole("button", { name: "Account menu" })).toBeVisible();

    await page.goto("/settings/security");
    await page.getByLabel("Current password").fill(user.password);
    await page.getByLabel("New password", { exact: true }).fill("another-long-password-2");
    await page.getByLabel("Confirm new password").fill("another-long-password-2");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed. Other devices were signed out.")).toBeVisible();
    await otherPage.reload();
    await otherPage.waitForURL(/\/sign-in/);
  });
});
