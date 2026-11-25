import type { Page } from "@playwright/test";
import { createDocument, createWorkspace, expect, inviteAndAccept, newUserContext, registerAndSignIn, test } from "./support/helpers";

const body = (page: Page) => page.getByRole("textbox", { name: "Document body" });
const status = (page: Page) => page.getByTestId("sync-status");
/** Document text without the remote-cursor name labels that Tiptap renders inside the editor. */
const plainText = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".ProseMirror p")]
      .map((node) => {
        const copy = node.cloneNode(true) as HTMLElement;
        copy.querySelectorAll(".collaboration-carets__caret").forEach((caret) => caret.remove());
        return copy.textContent;
      })
      .join("\n")
  );

async function setupPair(browser: import("@playwright/test").Browser, page: Page, role: "editor" | "viewer" = "editor") {
  await registerAndSignIn(page, "Writer");
  const workspaceId = await createWorkspace(page, "Team");
  const guest = await newUserContext(browser, "Guest");
  await inviteAndAccept(page, workspaceId, guest, role);
  await page.goto(`/w/${workspaceId}`);
  const documentId = await createDocument(page);
  await guest.page.goto(`/d/${documentId}`);
  await expect(body(guest.page)).toBeVisible();
  return { workspaceId, documentId, guest };
}

test.describe("real-time collaboration", () => {
  test("two people see each other's edits, cursors and presence, and converge", async ({ page, browser }) => {
    const { guest } = await setupPair(browser, page);
    await body(page).click();
    await page.keyboard.type("Hello from the first writer. ");
    await expect(body(guest.page)).toContainText("Hello from the first writer.");

    await body(guest.page).click();
    await guest.page.keyboard.press("End");
    await guest.page.keyboard.type("And a reply from the guest.");
    await expect(body(page)).toContainText("And a reply from the guest.");
    await expect.poll(() => plainText(page)).toBe(await plainText(guest.page));

    // presence: each sees the other, and the remote caret label carries the real name
    await expect(page.getByTestId("presence").getByRole("listitem")).toHaveCount(2);
    await expect(page.locator(".collaboration-carets__label")).toContainText(guest.user.name);

    // presence disappears when the other person leaves
    await guest.context.close();
    await expect(page.getByTestId("presence").getByRole("listitem")).toHaveCount(1, { timeout: 15_000 });
    await expect(status(page)).toHaveAttribute("data-state", "Saved");
  });

  test("formatting persists through Yjs and survives a reload", async ({ page }) => {
    await registerAndSignIn(page, "Fmt");
    await createWorkspace(page, "Fmt space");
    await createDocument(page);
    await body(page).click();
    await page.keyboard.type("# Project plan");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Some ");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.type("bold");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.type(" and ");
    await page.keyboard.press("ControlOrMeta+i");
    await page.keyboard.type("italic");
    await page.keyboard.press("ControlOrMeta+i");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- first item");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second item");
    await expect(status(page)).toHaveAttribute("data-state", "Saved");

    await page.reload();
    await expect(body(page).locator("h1")).toHaveText("Project plan");
    await expect(body(page).locator("strong")).toHaveText("bold");
    await expect(body(page).locator("em")).toHaveText("italic");
    await expect(body(page).locator("ul li")).toHaveText(["first item", "second item"]);
  });

  test("keeps working offline and syncs when the connection returns", async ({ page, browser }) => {
    const { guest, documentId } = await setupPair(browser, page);
    await body(page).click();
    await page.keyboard.type("Online text. ");
    await expect(body(guest.page)).toContainText("Online text.");

    await guest.context.setOffline(true);
    await expect(status(guest.page)).toHaveAttribute("data-state", "Offline");
    await body(guest.page).click();
    await guest.page.keyboard.press("End");
    await guest.page.keyboard.type("Typed while offline.");
    await expect(status(guest.page)).toHaveAttribute("title", /unsynced change/);
    await expect(body(page)).not.toContainText("Typed while offline.");

    // meanwhile the other person keeps writing
    await page.keyboard.type("More from online. ");

    await guest.context.setOffline(false);
    await expect(status(guest.page)).toHaveAttribute("data-state", "Saved", { timeout: 20_000 });
    await expect(body(page)).toContainText("Typed while offline.");
    await expect(body(guest.page)).toContainText("More from online.");
    await expect.poll(() => plainText(page)).toBe(await plainText(guest.page));

    // and it's durable
    await guest.page.goto(`/d/${documentId}`);
    await expect(body(guest.page)).toContainText("Typed while offline.");
  });

  test("offline edits survive a reload before they reach the server", async ({ page, context }) => {
    await registerAndSignIn(page, "Offline");
    await createWorkspace(page, "Offline space");
    const documentId = await createDocument(page);
    await body(page).click();
    await page.keyboard.type("Saved baseline. ");
    await expect(status(page)).toHaveAttribute("data-state", "Saved");

    await context.setOffline(true);
    await expect(status(page)).toHaveAttribute("data-state", "Offline");
    await page.keyboard.type("Unsynced words.");
    await expect(status(page)).toHaveAttribute("title", /saved on this device/);
    // let the IndexedDB write land, then bring the network back and reload
    await page.waitForTimeout(300);
    await context.setOffline(false);
    await page.goto(`/d/${documentId}`);
    await expect(body(page)).toContainText("Unsynced words.");
    await expect(status(page)).toHaveAttribute("data-state", "Saved", { timeout: 20_000 });
  });
});

test.describe("permissions on a live document", () => {
  test("viewers get a read-only editor and the server refuses their writes", async ({ page, browser }) => {
    const { guest, documentId } = await setupPair(browser, page, "viewer");
    await body(page).click();
    await page.keyboard.type("Owner text.");
    await expect(body(guest.page)).toContainText("Owner text."); // viewers still see live updates

    await expect(body(guest.page)).toHaveAttribute("contenteditable", "false");
    await expect(guest.page.getByRole("toolbar", { name: "Formatting" })).toHaveCount(0);
    await expect(guest.page.getByText("view-only")).toBeVisible();
    await expect(status(guest.page)).toHaveAttribute("data-state", "View only");

    // Hiding the UI is not the control. Open a raw socket with the viewer's own cookie and try to write.
    const outcome = await guest.page.evaluate(
      ({ documentId, api }) =>
        new Promise<string>((resolve) => {
          const socket = new WebSocket(`${api.replace("http", "ws")}/collaboration?documentId=${documentId}`);
          const timer = setTimeout(() => resolve("timeout"), 8000);
          socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === "document.snapshot") {
              socket.send(JSON.stringify({ type: "document.update", payload: { documentId, updateId: "forged-1", payload: "AAA=" } }));
            }
            if (message.type === "document.rejected") {
              clearTimeout(timer);
              resolve(message.payload.reason);
            }
          };
        }),
      { documentId, api: "http://localhost:3101" }
    );
    expect(outcome).toBe("read_only");
    await expect(body(page)).not.toContainText("forged");
  });

  test("promoting a viewer to editor takes effect on their open document without a reload", async ({ page, browser }) => {
    const { guest, workspaceId } = await setupPair(browser, page, "viewer");
    await expect(body(guest.page)).toHaveAttribute("contenteditable", "false");

    await page.goto(`/w/${workspaceId}/members`);
    await page.getByLabel(`Role for ${guest.user.name}`).selectOption("editor");
    await expect(page.getByText(/is now an editor/)).toBeVisible();

    await expect(body(guest.page)).toHaveAttribute("contenteditable", "true", { timeout: 15_000 });
    await body(guest.page).click();
    await guest.page.keyboard.type("Now I can write.");
    await expect(status(guest.page)).toHaveAttribute("data-state", "Saved");
  });

  test("demoting an editor stops their edits immediately", async ({ page, browser }) => {
    const { guest, workspaceId, documentId } = await setupPair(browser, page, "editor");
    await body(guest.page).click();
    await guest.page.keyboard.type("Allowed. ");
    await expect(status(guest.page)).toHaveAttribute("data-state", "Saved");

    await page.goto(`/w/${workspaceId}/members`);
    await page.getByLabel(`Role for ${guest.user.name}`).selectOption("viewer");
    await expect(page.getByText(/is now a(n)? viewer/)).toBeVisible();
    await expect(body(guest.page)).toHaveAttribute("contenteditable", "false", { timeout: 15_000 });
    await page.goto(`/d/${documentId}`);
    await expect(body(page)).toContainText("Allowed.");
  });

  test("removing a member closes their open document and revokes access", async ({ page, browser }) => {
    const { guest, workspaceId, documentId } = await setupPair(browser, page, "editor");
    await page.goto(`/w/${workspaceId}/members`);
    await page.getByRole("button", { name: `Remove ${guest.user.name}` }).click();
    // the open page reloads the document once it learns access is gone, and the API answers 404
    const refetch = guest.page.waitForResponse((reply) => reply.url().endsWith(`/documents/${documentId}`) && reply.status() === 404);
    await page.getByRole("button", { name: "Remove member" }).click();
    await expect(page.getByText(`${guest.user.name} was removed`)).toBeVisible();

    // the explanation must still be there after that reload, and the document must be gone
    await refetch;
    await expect(body(guest.page)).toHaveCount(0);
    await expect(guest.page.getByRole("alert").filter({ hasText: "Your access to this workspace was removed" })).toBeVisible();
    // the API no longer serves the document to them either
    const response = await guest.page.request.get(`http://localhost:3101/documents/${documentId}`);
    expect(response.status()).toBe(404);
  });

  test("an owner can't remove or demote the last owner", async ({ page }) => {
    await registerAndSignIn(page, "Solo");
    const workspaceId = await createWorkspace(page, "Solo space");
    await page.goto(`/w/${workspaceId}/members`);
    await page.getByLabel(/Role for Solo/).selectOption("editor");
    await expect(page.getByText("A workspace needs at least one owner")).toBeVisible();
    await expect(page.getByLabel(/Role for Solo/)).toHaveValue("owner"); // UI reverts to what the server kept
  });

  test("signing the editor out elsewhere ends their live connection", async ({ page, browser }) => {
    const { guest } = await setupPair(browser, page, "editor");
    await guest.page.goto("/settings/security");
    await guest.page.getByRole("button", { name: "Sign out everywhere" }).click();
    await guest.page.waitForURL(/\/sign-in/);
    const stale = await guest.page.request.get("http://localhost:3101/me");
    expect(stale.status()).toBe(401);
  });
});

test.describe("version history", () => {
  test("restoring an earlier version rewinds the document for everyone and can itself be undone", async ({ page, browser }) => {
    const { guest, documentId } = await setupPair(browser, page);
    await body(page).click();
    await page.keyboard.type("First draft. ");
    await expect(status(page)).toHaveAttribute("data-state", "Saved");
    await page.waitForTimeout(150);
    await page.keyboard.type("Second thought.");
    await expect(status(page)).toHaveAttribute("data-state", "Saved");
    await expect(body(guest.page)).toContainText("Second thought.");

    await page.goto(`/d/${documentId}/history`);
    const versions = page.getByRole("navigation", { name: "Versions" }).getByRole("button");
    await expect(versions.first()).toBeVisible();
    const total = await versions.count();
    // the oldest listed version, i.e. right after the first few keystrokes
    await versions.nth(total - 1).click();
    await expect(page.getByText(/Read-only preview of version 1/)).toBeVisible();
    await page.getByRole("button", { name: "Restore this version" }).click();
    await page.getByRole("button", { name: "Restore version" }).click();
    await expect(page.getByText(/Restored version 1 as a new version/)).toBeVisible();
    await page.waitForURL(new RegExp(`/d/${documentId}$`));

    await expect(body(page)).not.toContainText("Second thought.");
    // the other person's open editor changed live, with no reload
    await expect(body(guest.page)).not.toContainText("Second thought.", { timeout: 15_000 });

    // history was not rewritten: the restore is a new, newest entry and the old tip is still there
    await page.goto(`/d/${documentId}/history`);
    await expect(versions.first()).toBeVisible();
    expect(await versions.count()).toBeGreaterThan(total);
    const newest = await versions.first().textContent();
    expect(newest).toMatch(/v\d+/);
    await versions.nth(1).click();
    await expect(page.getByText(/Read-only preview of version/)).toBeVisible();
    await expect(page.locator(".ProseMirror")).toContainText("Second thought.");
  });

  test("viewers can browse history but are not offered a restore", async ({ page, browser }) => {
    const { guest, documentId } = await setupPair(browser, page, "viewer");
    await body(page).click();
    await page.keyboard.type("Some owner text.");
    await expect(status(page)).toHaveAttribute("data-state", "Saved");
    await guest.page.goto(`/d/${documentId}/history`);
    await expect(guest.page.getByRole("navigation", { name: "Versions" }).getByRole("button").first()).toBeVisible();
    await expect(guest.page.getByRole("button", { name: "Restore this version" })).toHaveCount(0);
    const response = await guest.page.request.post(`http://localhost:3101/documents/${documentId}/restore`, { headers: { Origin: "http://localhost:3100", "Content-Type": "application/json" }, data: { version: 1 } });
    expect(response.status()).toBe(403);
  });
});
