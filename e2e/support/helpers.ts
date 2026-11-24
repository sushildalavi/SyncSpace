import { expect as baseExpect, test as base, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import crypto from "node:crypto";

export const API = "http://localhost:3101";
export const WEB = "http://localhost:3100";
export const MAILPIT = "http://localhost:8025";
export const MOCK_GOOGLE = "http://localhost:3199";
export const PASSWORD = "correct-horse-battery";

/** A random address per browser context, so parallel tests don't share the API's rate-limit bucket. */
export const randomIp = () => `10.${crypto.randomInt(1, 250)}.${crypto.randomInt(1, 250)}.${crypto.randomInt(1, 250)}`;
export const contextOptions = () => ({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

export const test = base.extend({
  context: async ({ browser }, use) => {
    const context = await browser.newContext(contextOptions());
    await use(context);
    await context.close();
  }
});
export const expect = baseExpect;

export type TestUser = { name: string; email: string; password: string };

export function newUser(label = "User"): TestUser {
  const id = crypto.randomBytes(4).toString("hex");
  return { name: `${label} ${id}`, email: `${label.toLowerCase()}-${id}@example.test`, password: PASSWORD };
}

/** Most recent email sent to an address, via Mailpit's HTTP API. */
export async function latestEmail(request: APIRequestContext, to: string, subjectIncludes: string): Promise<{ text: string; links: string[] }> {
  let text = "";
  await expect
    .poll(
      async () => {
        const list = await (await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${to}` } })).json();
        const message = (list.messages as Array<{ ID: string; Subject: string }>).find((m) => m.Subject.includes(subjectIncludes));
        if (!message) return "";
        text = (await (await request.get(`${MAILPIT}/api/v1/message/${message.ID}`)).json()).Text as string;
        return text;
      },
      { message: `waiting for "${subjectIncludes}" email to ${to}`, timeout: 15_000 }
    )
    .not.toBe("");
  return { text, links: text.match(/https?:\/\/\S+/g) ?? [] };
}

export async function signUp(page: Page, user: TestUser): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel("Full name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
}

export async function verifyEmail(page: Page, user: TestUser): Promise<void> {
  const mail = await latestEmail(page.request, user.email, "Confirm your SyncSpace email");
  await page.goto(mail.links.find((link) => link.includes("verify-email"))!);
}

export async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Registers, verifies and signs in via the real UI. */
export async function registerAndSignIn(page: Page, label = "User"): Promise<TestUser> {
  const user = newUser(label);
  await signUp(page, user);
  await verifyEmail(page, user);
  await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
  await signIn(page, user);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  return user;
}

export async function newUserContext(browser: Browser, label: string): Promise<{ context: BrowserContext; page: Page; user: TestUser }> {
  const context = await browser.newContext(contextOptions());
  const page = await context.newPage();
  const user = await registerAndSignIn(page, label);
  return { context, page, user };
}

export async function createWorkspace(page: Page, name = "Acme"): Promise<string> {
  await page.getByLabel("Workspace name").fill(name);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL(/\/w\/[0-9a-f-]{36}$/);
  return page.url().split("/w/")[1]!;
}

export async function createDocument(page: Page): Promise<string> {
  await page.getByRole("button", { name: "New document" }).first().click();
  await page.waitForURL(/\/d\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("textbox", { name: "Document body" })).toBeVisible();
  return page.url().split("/d/")[1]!;
}

/** Invites by email and accepts from the invitee's own session using the emailed link. */
export async function inviteAndAccept(owner: Page, workspaceId: string, invitee: { page: Page; user: TestUser }, role: "editor" | "viewer" | "owner"): Promise<void> {
  await owner.goto(`/w/${workspaceId}/members`);
  await owner.getByLabel("Email address").fill(invitee.user.email);
  await owner.getByLabel("Role", { exact: true }).selectOption(role);
  await owner.getByRole("button", { name: "Send invite" }).click();
  await expect(owner.getByText(`Invitation sent to ${invitee.user.email}`)).toBeVisible();
  const mail = await latestEmail(owner.request, invitee.user.email, "Invitation to");
  await invitee.page.goto(mail.links.find((link) => link.includes("/invite"))!);
  await invitee.page.getByRole("button", { name: "Accept invitation" }).click();
  await invitee.page.waitForURL(new RegExp(`/w/${workspaceId}$`));
}

/** Plays Google's consent screen: intercepts the authorize redirect and returns to the callback. */
export async function mockGoogleConsent(
  page: Page,
  options: { sub: string; email: string; name: string; emailVerified?: boolean; outcome?: "approve" | "deny" | "bad-state" }
): Promise<{ authorizeUrl: URL | null }> {
  const captured: { authorizeUrl: URL | null } = { authorizeUrl: null };
  await page.route("https://accounts.google.com/**", async (route) => {
    const url = new URL(route.request().url());
    captured.authorizeUrl = url;
    const redirect = url.searchParams.get("redirect_uri")!;
    const state = url.searchParams.get("state")!;
    if (options.outcome === "deny") {
      return route.fulfill({ status: 302, headers: { location: `${redirect}?error=access_denied&state=${state}` } });
    }
    const { code } = await (
      await page.request.post(`${MOCK_GOOGLE}/__test/code`, {
        data: {
          redirectUri: redirect,
          challenge: url.searchParams.get("code_challenge"),
          scope: url.searchParams.get("scope"),
          nonce: url.searchParams.get("nonce"),
          profile: { sub: options.sub, email: options.email, name: options.name, emailVerified: options.emailVerified ?? true }
        }
      })
    ).json();
    const returnedState = options.outcome === "bad-state" ? "tampered-state" : state;
    return route.fulfill({ status: 302, headers: { location: `${redirect}?code=${code}&state=${returnedState}` } });
  });
  return captured;
}

export async function clickRevokeEverywhere(page: Page): Promise<void> {
  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await page.waitForURL(/\/sign-in/);
}

/** Inline form error, excluding Next.js's own route announcer which also has role="alert". */
export const formAlert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
