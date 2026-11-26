import type { Page } from "@playwright/test";
import { createDocument, createWorkspace, expect, latestEmail, newUserContext, registerAndSignIn, scan, test } from "./support/helpers";

const body = (page: Page) => page.getByRole("textbox", { name: "Document body" });

test.describe("sharing a single document", () => {
  test("a guest opens only that document, edits live, is made a viewer, then loses access", async ({ page, browser }) => {
    await registerAndSignIn(page, "Sharer");
    const workspaceId = await createWorkspace(page, "Private space");
    const privateId = await createDocument(page);
    await page.goto(`/w/${workspaceId}`);
    const documentId = await createDocument(page);
    await page.getByRole("textbox", { name: "Document title" }).fill("Launch brief");
    await page.getByRole("textbox", { name: "Document title" }).press("Enter");
    const guest = await newUserContext(browser, "Outsider");

    await page.getByRole("button", { name: "Share", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Share this document" });
    await dialog.getByLabel("Share with email").fill(guest.user.email);
    await dialog.getByLabel("Can", { exact: true }).selectOption("editor");
    await dialog.getByRole("button", { name: "Share", exact: true }).click();
    await expect(dialog.getByRole("combobox", { name: `Access for ${guest.user.email}` })).toHaveValue("editor");
    await scan(page, "share dialog");
    await page.keyboard.press("Escape"); // a modal dialog hides the page behind it

    const mail = await latestEmail(page.request, guest.user.email, "Shared with you");
    await guest.page.goto("/");
    await expect(guest.page.getByRole("heading", { name: "Shared with me" })).toBeVisible();
    await scan(guest.page, "home with a shared document");
    await guest.page.goto(mail.links.find((link) => link.includes(`/d/${documentId}`))!);
    await expect(body(guest.page)).toHaveAttribute("contenteditable", "true");
    await expect(guest.page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
    await body(guest.page).click();
    await guest.page.keyboard.type("Notes from outside.");
    await expect(body(page)).toContainText("Notes from outside.");

    // nothing else in the workspace is reachable
    for (const path of [`/documents/${privateId}`, `/workspaces/${workspaceId}`, `/workspaces/${workspaceId}/documents`, `/documents/${documentId}/shares`]) {
      const reply = await guest.page.request.get(`http://localhost:3101${path}`);
      expect([403, 404], path).toContain(reply.status());
    }

    await page.getByRole("button", { name: "Share", exact: true }).click();
    await dialog.getByRole("combobox", { name: `Access for ${guest.user.email}` }).selectOption("viewer");
    await expect(body(guest.page)).toHaveAttribute("contenteditable", "false", { timeout: 15_000 });

    await dialog.getByRole("button", { name: `Stop sharing with ${guest.user.email}` }).click();
    await expect(guest.page.getByRole("alert").filter({ hasText: "Your access to this document was removed" })).toBeVisible({ timeout: 15_000 });
    await expect(body(guest.page)).toHaveCount(0);
    await guest.context.close();
  });
});
