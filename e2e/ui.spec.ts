import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { API, WEB, createDocument, createWorkspace, expect, registerAndSignIn, test } from "./support/helpers";

const viewports = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 }
];

async function seed(page: Page) {
  await registerAndSignIn(page, "Ui");
  const workspaceId = await createWorkspace(page, "Design space");
  const documentId = await createDocument(page);
  await page.getByRole("textbox", { name: "Document body" }).click();
  await page.keyboard.type("# Heading\nSome body text for the layout checks.");
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "Saved");
  void API;
  return { workspaceId, documentId };
}

const hasHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

test.describe("responsive layout", () => {
  for (const viewport of viewports) {
    test(`no horizontal overflow or overlap at ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { workspaceId, documentId } = await seed(page);
      const routes = ["/", `/w/${workspaceId}`, `/w/${workspaceId}/members`, `/w/${workspaceId}/settings`, `/d/${documentId}`, `/d/${documentId}/history`, "/settings", "/settings/security", "/settings/connections"];
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator("main")).toBeVisible();
        await page.waitForTimeout(250);
        expect(await hasHorizontalOverflow(page), `overflow on ${route}`).toBe(false);
      }
      // touch targets on the primary controls
      if (viewport.width < 768) {
        await page.goto("/");
        const box = await page.getByRole("button", { name: "Open navigation" }).boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(32);
        expect(box!.height).toBeGreaterThanOrEqual(32);
      }
    });
  }

  test("mobile navigation opens as a drawer, traps focus and closes with Escape", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seed(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation" });
    await expect(drawer).toBeVisible();
    for (let index = 0; index < 20; index += 1) await page.keyboard.press("Tab");
    expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await page.getByRole("button", { name: "Open navigation" }).click();
    await drawer.getByRole("link", { name: "Members" }).click();
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/members$/);
  });
});

test.describe("themes", () => {
  test("theme choice persists across reloads and follows the OS when set to system", async ({ page }) => {
    await registerAndSignIn(page, "Theme");
    await page.goto("/settings/appearance");
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.getByRole("radio", { name: "System" }).click();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});

test.describe("keyboard and navigation", () => {
  test("command menu opens with the shortcut, searches documents and navigates", async ({ page }) => {
    await registerAndSignIn(page, "Cmd");
    await createWorkspace(page, "Cmd space");
    await createDocument(page);
    await page.getByRole("textbox", { name: "Document title" }).fill("Quarterly planning");
    await page.getByRole("textbox", { name: "Document title" }).press("Enter");
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await page.goto("/");
    await page.waitForTimeout(400);
    await page.keyboard.press("ControlOrMeta+k");
    const menu = page.getByRole("dialog", { name: "Command menu" });
    await expect(menu).toBeVisible();
    await page.keyboard.type("quarterly");
    await expect(menu.getByRole("option", { name: /Quarterly planning/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/d\//);
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("zzzz-nothing");
    await expect(menu.getByText(/No documents match/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("skip link and focus order reach the main content", async ({ page }) => {
    await registerAndSignIn(page, "Skip");
    await createWorkspace(page, "Skip space"); // new users get an autofocused onboarding form instead
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await page.reload(); // a fresh document resets the sequential-focus starting point
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
  });

  test("dialogs trap focus and return it to the trigger", async ({ page }) => {
    await registerAndSignIn(page, "Dlg");
    const workspaceId = await createWorkspace(page, "Dialog space");
    await page.goto(`/w/${workspaceId}/settings`);
    const trigger = page.getByRole("button", { name: "Delete workspace" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (let index = 0; index < 8; index += 1) await page.keyboard.press("Tab");
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("editor formatting is reachable with the keyboard and exposes pressed state", async ({ page }) => {
    await registerAndSignIn(page, "Kbd");
    await createWorkspace(page, "Kbd space");
    await createDocument(page);
    await page.getByRole("textbox", { name: "Document body" }).click();
    await page.keyboard.press("ControlOrMeta+b");
    await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("ControlOrMeta+b");
    await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("accessibility (axe, WCAG 2.2 AA rules)", () => {
  const scan = async (page: Page, label: string) => {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    expect(summary, `axe violations on ${label}`).toEqual([]);
  };

  for (const scheme of ["light", "dark"] as const) {
    test(`public auth pages (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const route of ["/sign-in", "/sign-up", "/forgot-password", "/auth/error?error=access_denied"]) {
        await page.goto(route);
        await expect(page.locator("h1")).toBeVisible();
        await scan(page, `${route} ${scheme}`);
      }
    });

    test(`signed-in pages (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const { workspaceId, documentId } = await seed(page);
      for (const route of ["/", `/w/${workspaceId}`, `/w/${workspaceId}/members`, `/w/${workspaceId}/settings`, `/d/${documentId}`, `/d/${documentId}/history`, "/settings", "/settings/security", "/settings/connections", "/settings/appearance"]) {
        await page.goto(route);
        await expect(page.locator("main")).toBeVisible();
        await page.waitForTimeout(500);
        await scan(page, `${route} ${scheme}`);
      }
    });
  }
});

void WEB;
