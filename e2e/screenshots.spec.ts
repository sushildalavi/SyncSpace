/**
 * Generates the product screenshots used in the README and for visual review.
 * Run with: SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 * It drives the real UI against the real API (no mocked state).
 */
import path from "node:path";
import type { Browser, Page } from "@playwright/test";
import { API, WEB, contextOptions, createWorkspace, expect, inviteAndAccept, newUserContext, registerAndSignIn, test } from "./support/helpers";

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate screenshots");
test.describe.configure({ mode: "serial" });

const out = process.env.SCREENSHOT_DIR ?? path.join(process.cwd(), "docs/screenshots");
async function settle(page: Page) {
  // never capture a half-loaded screen: wait for skeletons to go and layout to stop moving
  await expect(page.locator(".skeleton")).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(250);
}
const shot = async (page: Page, name: string, fullPage = false) => {
  await settle(page);
  return page.screenshot({ path: path.join(out, `${name}.png`), fullPage, animations: "disabled" });
};
const body = (page: Page) => page.getByRole("textbox", { name: "Document body" });

async function themed(browser: Browser, scheme: "light" | "dark", viewport: { width: number; height: number }) {
  const context = await browser.newContext({ ...contextOptions(), colorScheme: scheme, viewport, deviceScaleFactor: 2 });
  return { context, page: await context.newPage() };
}

test("sign-in screen", async ({ browser }) => {
  const { context, page } = await themed(browser, "light", { width: 1440, height: 900 });
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await shot(page, "signInLight");
  await context.close();
});

test("product tour (desktop, light and dark)", async ({ browser }) => {
  const { context, page } = await themed(browser, "light", { width: 1440, height: 900 });
  const ada = await registerAndSignIn(page, "Ada");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Account settings" }).click();
  await page.getByLabel("Display name").fill("Ada Lovelace");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Profile updated")).toBeVisible();
  await page.goto("/");

  const workspaceId = await createWorkspace(page, "Acme Product");
  await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();

  // seed documents through the real API with the signed-in cookie
  const headers = { Origin: WEB, "Content-Type": "application/json" };
  const ids: string[] = [];
  for (const title of ["Q4 roadmap", "Meeting notes", "Onboarding guide", "Launch checklist"]) {
    const response = await page.request.post(`${API}/workspaces/${workspaceId}/documents`, { headers, data: { title } });
    ids.push((await response.json()).id);
  }
  await page.request.put(`${API}/documents/${ids[0]}/favorite`, { headers });
  await page.goto(`/d/${ids[0]}`);

  const grace = await newUserContext(browser, "Grace");
  await inviteAndAccept(page, workspaceId, grace, "editor");
  await grace.page.setViewportSize({ width: 1440, height: 900 });
  await grace.page.goto(`/d/${ids[0]}`);
  await expect(body(grace.page)).toBeVisible();

  await page.goto(`/d/${ids[0]}`);
  await body(page).click();
  await page.keyboard.type("# Q4 roadmap");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Three bets for the quarter, in priority order. Everything here is edited live by the whole team.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("## Goals");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- Ship real-time presence to every plan");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Cut document load time in half");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Launch the offline mode beta");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Owners: Ada and Grace. ");
  await expect(body(grace.page)).toContainText("Launch the offline mode beta");
  await body(grace.page).click();
  await grace.page.keyboard.type(" Grace is reviewing the risks now");
  await expect(body(page)).toContainText("reviewing the risks");
  await expect(page.locator(".collaboration-carets__label")).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "editorCollaborationLight");

  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Share this document" })).toBeVisible();
  await page.getByRole("dialog").getByLabel("Share with email").fill("sam@example.test");
  await page.getByRole("dialog").getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Access for sam@example.test" })).toBeVisible();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10_000 });
  await shot(page, "shareDialogLight");
  await page.keyboard.press("Escape");

  await page.goto(`/w/${workspaceId}/members`);
  await expect(page.getByText(grace.user.name).first()).toBeVisible();
  await shot(page, "membersLight");
  await page.goto("/settings/security");
  await expect(page.getByText("This device")).toBeVisible();
  await shot(page, "securityLight");
  await page.goto("/settings/connections");
  await expect(page.getByText("Sign-in methods")).toBeVisible();
  await shot(page, "connectionsLight");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Delete account" })).toBeVisible();
  await shot(page, "accountLight", true);
  await page.goto(`/d/${ids[0]}/history`);
  await expect(page.getByRole("navigation", { name: "Versions" })).toBeVisible();
  await page.getByRole("navigation", { name: "Versions" }).getByRole("button").nth(1).click(); // an older version, so Restore is offered
  await expect(page.getByRole("button", { name: "Restore this version" })).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "historyLight");

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await page.waitForTimeout(500);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("dialog", { name: "Command menu" })).toBeVisible();
  await shot(page, "commandMenuLight");
  await page.keyboard.press("Escape");

  // same pages in dark mode
  await page.emulateMedia({ colorScheme: "dark" });
  await grace.page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`/d/${ids[0]}`);
  await expect(body(page)).toContainText("Q4 roadmap");
  await body(grace.page).click();
  await grace.page.keyboard.type(".");
  await page.waitForTimeout(500);
  await shot(page, "editorCollaborationDark");
  await page.goto("/");
  await expect(page.getByText("Q4 roadmap").first()).toBeVisible();
  await shot(page, "dashboardDark");

  // mobile
  const mobile = await browser.newContext({ ...contextOptions(), colorScheme: "light", viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true });
  const mp = await mobile.newPage();
  await mp.goto("/sign-in");
  await mp.getByLabel("Email").fill(ada.email);
  await mp.getByLabel("Password", { exact: true }).fill(ada.password);
  await mp.getByRole("button", { name: "Sign in" }).click();
  await expect(mp.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await mp.getByRole("button", { name: "Open navigation" }).click();
  await expect(mp.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await mp.waitForTimeout(400);
  await shot(mp, "mobileNavigation");
  await mp.keyboard.press("Escape");
  await mp.goto(`/d/${ids[0]}`);
  await expect(mp.getByRole("textbox", { name: "Document body" })).toContainText("Q4 roadmap");
  await mp.waitForTimeout(500);
  await shot(mp, "mobileEditor");
  await mobile.close();
  await context.close();
  await grace.context.close();
});
