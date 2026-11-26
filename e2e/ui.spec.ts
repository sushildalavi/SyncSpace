import type { Page } from "@playwright/test";
import { createDocument, createWorkspace, expect, registerAndSignIn, scan, test } from "./support/helpers";

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

test.describe("structure a screen reader relies on", () => {
  /** Headings in the page's own structure; headings a person typed into a document are their content. */
  const outline = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll("h1,h2,h3,h4")]
        .filter((node) => !node.closest(".ProseMirror") && (node as HTMLElement).checkVisibility())
        .map((node) => Number(node.tagName[1]))
    );

  test("every page has its own title, one main region, an ordered heading outline and fits 320px", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/forgot-password");
    await expect(page).toHaveTitle("Reset your password · SyncSpace");
    await page.goto("/nothing-here");
    await expect(page).toHaveTitle("Page not found · SyncSpace");
    await expect(page.getByRole("main")).toHaveCount(1);

    const { workspaceId, documentId } = await seed(page);
    const pages: Array<[string, string]> = [
      ["/", "Home"],
      [`/w/${workspaceId}`, "Design space"],
      [`/w/${workspaceId}/members`, "Members"],
      [`/w/${workspaceId}/settings`, "Workspace settings"],
      [`/d/${documentId}`, "Untitled"],
      [`/d/${documentId}/history`, "Version history · Untitled"],
      ["/settings", "Profile settings"],
      ["/settings/security", "Security settings"],
      ["/settings/connections", "Connections settings"],
      ["/settings/appearance", "Appearance settings"],
      ["/d/00000000-0000-0000-0000-000000000000", "Not found"]
    ];
    await page.setViewportSize({ width: 320, height: 640 });
    for (const [route, title] of pages) {
      await page.goto(route);
      await expect(page, route).toHaveTitle(`${title} · SyncSpace`);
      await expect(page.getByRole("main"), route).toHaveCount(1);
      await page.waitForTimeout(400);
      const levels = await outline(page);
      expect(levels.filter((level) => level === 1), `one h1 on ${route}`).toHaveLength(1);
      expect(levels[0], `h1 comes first on ${route}`).toBe(1);
      for (let index = 1; index < levels.length; index += 1) expect(levels[index]! - levels[index - 1]!, `skipped heading level on ${route}`).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => { const main = document.querySelector("main")!; return main.scrollWidth - main.clientWidth; }), `320px overflow on ${route}`).toBeLessThanOrEqual(1);
    }
  });

  test("in-app navigation renames the page, and the editor is not a keyboard trap", async ({ page }) => {
    const { documentId } = await seed(page);
    await page.goto("/");
    await expect(page).toHaveTitle("Home · SyncSpace");
    await page.getByRole("link", { name: "Members" }).click();
    await expect(page).toHaveTitle("Members · SyncSpace");

    await page.goto(`/d/${documentId}`);
    const editor = page.getByRole("textbox", { name: "Document body" });
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("- one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("two");
    // Tab indents a list item once; after that it has to move on
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(editor).not.toBeFocused();
  });
});

test.describe("accessibility (axe, WCAG 2.2 AA rules)", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`public auth pages (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const route of ["/sign-in", "/sign-up", "/forgot-password", "/two-factor", "/auth/error?error=access_denied"]) {
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
