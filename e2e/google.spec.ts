/**
 * Google sign-in, exercised through Better Auth's real callback handling.
 * Google itself is replaced by e2e/support/mockGoogle.mjs, which signs genuine RS256 ID tokens
 * and enforces PKCE. These tests prove this app's OAuth handling. They do not prove that Google's
 * live service accepts the configured client. See docs/googleSignIn.md for the live checklist.
 */
import crypto from "node:crypto";
import { expect, formAlert, mockGoogleConsent, newUser, registerAndSignIn, test } from "./support/helpers";

const google = (label: string) => {
  const id = crypto.randomBytes(4).toString("hex");
  return { sub: `google-${id}`, email: `${label}-${id}@gmail.test`, name: `${label} ${id}` };
};

async function me(page: import("@playwright/test").Page) {
  const response = await page.request.get("http://localhost:3101/me");
  return response.ok() ? ((await response.json()) as { id: string; email: string; emailVerified: boolean }) : null;
}

test.describe("Google sign-in", () => {
  test("creates a verified account with the minimum scopes, PKCE and state", async ({ page }) => {
    const profile = google("first");
    const captured = await mockGoogleConsent(page, profile);
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();

    const url = captured.authorizeUrl!;
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("state")?.length).toBeGreaterThan(16);
    expect([...new Set(url.searchParams.get("scope")!.split(" "))].sort()).toEqual(["email", "openid", "profile"]);
    expect(url.searchParams.get("access_type")).not.toBe("offline"); // no refresh token requested
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3101/api/auth/callback/google");

    const user = await me(page);
    expect(user).toMatchObject({ email: profile.email, emailVerified: true });
  });

  test("signing in again with Google after signing out returns the same account", async ({ page }) => {
    const profile = google("again");
    await mockGoogleConsent(page, profile);
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    const first = await me(page);

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL(/\/sign-in/);
    expect(await me(page)).toBeNull();

    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    expect((await me(page))?.id).toBe(first?.id);
  });

  test("cancelling Google's consent screen shows a calm explanation and creates no session", async ({ page }) => {
    await mockGoogleConsent(page, { ...google("cancel"), outcome: "deny" });
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.getByRole("heading", { name: "Google sign-in was cancelled" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
    expect(await me(page)).toBeNull();
  });

  test("an invalid or tampered OAuth state is rejected", async ({ page }) => {
    await mockGoogleConsent(page, { ...google("state"), outcome: "bad-state" });
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page).toHaveURL(/\/auth\/error\?error=/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("That sign-in attempt expired");
    expect(await me(page)).toBeNull();
  });

  test("does not merge into an existing account just because the email matches", async ({ page, browser }) => {
    const owner = await registerAndSignIn(page, "Owner");
    const ownerId = (await me(page))?.id;
    // A different browser (the "attacker") authenticates with a Google identity claiming the same email.
    const attacker = await browser.newContext();
    const attackerPage = await attacker.newPage();
    await mockGoogleConsent(attackerPage, { sub: `google-${crypto.randomBytes(4).toString("hex")}`, email: owner.email, name: "Not The Owner" });
    await attackerPage.goto("/sign-in");
    await attackerPage.getByRole("button", { name: "Continue with Google" }).click();
    await expect(attackerPage.getByRole("heading", { name: "An account with this email already exists" })).toBeVisible();
    expect(await me(attackerPage)).toBeNull();
    expect((await me(page))?.id).toBe(ownerId); // the real account is untouched
  });

  test("links Google from settings, then Google sign-in reaches the same account", async ({ page, browser }) => {
    const user = await registerAndSignIn(page, "Linker");
    const accountId = (await me(page))?.id;
    const profile = { sub: `google-${crypto.randomBytes(4).toString("hex")}`, email: user.email, name: user.name };
    await mockGoogleConsent(page, profile);
    await page.goto("/settings/connections");
    await page.getByRole("button", { name: "Connect Google" }).click();
    await expect(page.getByText("Google connected")).toBeVisible();
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await mockGoogleConsent(otherPage, profile);
    await otherPage.goto("/sign-in");
    await otherPage.getByRole("button", { name: "Continue with Google" }).click();
    await expect(otherPage.getByRole("button", { name: "Account menu" })).toBeVisible();
    expect((await me(otherPage))?.id).toBe(accountId);
  });

  test("refuses to link a Google account that already belongs to someone else", async ({ page, browser }) => {
    const sub = `google-${crypto.randomBytes(4).toString("hex")}`;
    const first = await registerAndSignIn(page, "Holder");
    await mockGoogleConsent(page, { sub, email: first.email, name: first.name });
    await page.goto("/settings/connections");
    await page.getByRole("button", { name: "Connect Google" }).click();
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();

    const second = await browser.newContext();
    const secondPage = await second.newPage();
    const user2 = await registerAndSignIn(secondPage, "Taker");
    await mockGoogleConsent(secondPage, { sub, email: user2.email, name: user2.name });
    await secondPage.goto("/settings/connections");
    await secondPage.getByRole("button", { name: "Connect Google" }).click();
    await expect(secondPage.getByRole("heading", { name: "That Google account belongs to someone else" })).toBeVisible();
  });

  test("won't disconnect Google when it is the only way to sign in", async ({ page }) => {
    await mockGoogleConsent(page, google("only"));
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await page.goto("/settings/connections");
    await page.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByText("You can't disconnect your only way to sign in")).toBeVisible();
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
  });

  test("a Google-only user can add a password through the emailed link", async ({ page }) => {
    await mockGoogleConsent(page, google("setpw"));
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await page.goto("/settings/security");
    await expect(page.getByText("haven't set a password")).toBeVisible();
    await expect(page.getByLabel("Current password")).toHaveCount(0);
  });

  test("the Google button is hidden when the server hasn't configured Google", async ({ page }) => {
    await page.route("**/config", (route) => route.fulfill({ json: { googleEnabled: false, requireEmailVerification: true } }));
    await page.goto("/sign-in");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
  });

  test("an unconfigured identity can't be used to sign in with a password", async ({ page }) => {
    const profile = google("nopass");
    await mockGoogleConsent(page, profile);
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(profile.email);
    await page.getByLabel("Password", { exact: true }).fill("guess-guess-guess-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(formAlert(page)).toContainText("don't match");
  });
});

void newUser;
