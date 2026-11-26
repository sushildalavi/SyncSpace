import {
  contextOptions,
  createDocument,
  createWorkspace,
  expect,
  formAlert,
  inviteAndAccept,
  latestEmail,
  newUserContext,
  registerAndSignIn,
  scan,
  signIn,
  test,
  totp
} from "./support/helpers";

test.describe("two-factor sign-in", () => {
  test("is set up with an authenticator app, then asked for at sign-in, with backup codes as a fallback", async ({ page, context }) => {
    const user = await registerAndSignIn(page, "Totp");
    await createWorkspace(page, "Totp space");
    await page.goto("/settings/security");
    await page.getByRole("button", { name: "Set up two-factor sign-in" }).click();
    await page.getByLabel("Enter your password to continue").fill(user.password);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
    await scan(page, "two-factor setup");
    const secret = (await page.getByTestId("totp-secret").textContent())!;
    await page.getByLabel(/Enter the 6-digit code/).fill(totp(secret));
    await page.getByRole("button", { name: "Turn on" }).click();
    const codes = page.getByRole("list", { name: "Backup codes" }).getByRole("listitem");
    await expect(codes.first()).toBeVisible();
    const backup = (await codes.first().textContent())!;
    await scan(page, "backup codes");
    await page.getByRole("button", { name: "I've saved them" }).click();
    await expect(page.getByRole("button", { name: "Turn off" })).toBeVisible();

    await context.clearCookies();
    await signIn(page, user);
    await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
    // the password alone opens nothing
    expect((await page.request.get("http://localhost:3101/me")).status()).toBe(401);
    await page.getByLabel("6-digit code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(formAlert(page)).toContainText("That code isn't right");
    await page.getByLabel("6-digit code").fill(totp(secret));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();

    await context.clearCookies();
    await signIn(page, user);
    await page.getByRole("button", { name: "Use a backup code instead" }).click();
    await page.getByLabel("Backup code").fill(backup);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();

    await page.goto("/settings/security");
    await expect(page.getByText("Two-factor sign-in turned on")).toBeVisible();
    await page.getByRole("button", { name: "Turn off" }).click();
    await page.getByLabel("Enter your password to continue").fill(user.password);
    await page.getByRole("button", { name: "Turn off" }).click();
    await expect(page.getByRole("button", { name: "Set up two-factor sign-in" })).toBeVisible();
    await context.clearCookies();
    // password sign-in is limited to a few attempts per address in quick succession; this is a fourth
    await context.setExtraHTTPHeaders(contextOptions().extraHTTPHeaders);
    await signIn(page, user);
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  });
});

test.describe("email change", () => {
  test("moves the account after both addresses agree", async ({ page, context }) => {
    const user = await registerAndSignIn(page, "Mover");
    await createWorkspace(page, "Mover space");
    const target = `new-${user.email}`;
    await page.goto("/settings");
    await page.getByLabel("New email address").fill(target);
    await page.getByRole("button", { name: "Change email" }).click();
    await expect(page.getByText(/approve the change/)).toBeVisible();

    const approval = await latestEmail(page.request, user.email, "Approve your SyncSpace email change");
    await page.goto(approval.links.find((link) => link.includes("verify-email"))!);
    await expect(page.getByText("Link accepted")).toBeVisible();
    await expect(page.getByRole("main").getByText(user.email, { exact: true })).toBeVisible();

    const confirmation = await latestEmail(page.request, target, "Confirm your SyncSpace email");
    await page.goto(confirmation.links.find((link) => link.includes("verify-email"))!);
    await expect(page.getByRole("main").getByText(target, { exact: true })).toBeVisible();

    await context.clearCookies();
    await signIn(page, { ...user, email: target });
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  });
});

test.describe("account deletion", () => {
  test("is blocked for a sole owner with teammates, then removes the account and keeps shared text", async ({ page, browser }) => {
    const owner = await registerAndSignIn(page, "Leaver");
    const workspaceId = await createWorkspace(page, "Crew");
    const guest = await newUserContext(browser, "Stayer");
    await inviteAndAccept(page, workspaceId, guest, "editor");
    await page.goto(`/w/${workspaceId}`);
    const documentId = await createDocument(page);
    await page.getByRole("textbox", { name: "Document body" }).click();
    await page.keyboard.type("Written before leaving.");
    await expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "Saved");

    await page.goto("/settings");
    await page.getByRole("button", { name: "Delete my account" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your account?" });
    await expect(dialog.getByRole("link", { name: "Crew" })).toBeVisible();
    await scan(page, "blocked deletion");
    await page.keyboard.press("Escape");

    await page.goto(`/w/${workspaceId}/members`);
    await page.getByLabel(`Role for ${guest.user.name}`).selectOption("owner");
    await expect(page.getByText(/is now an owner/)).toBeVisible();

    await page.goto("/settings");
    await page.getByRole("button", { name: "Delete my account" }).click();
    const confirm = dialog.getByRole("button", { name: "Delete account" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/to confirm/).fill(owner.email);
    await dialog.getByLabel("Your password", { exact: true }).fill("not-my-password");
    await scan(page, "deletion dialog");
    await confirm.click();
    await expect(dialog.getByText("That password isn't correct")).toBeVisible();
    await dialog.getByLabel("Your password", { exact: true }).fill(owner.password);
    await confirm.click();
    await expect(page.getByText("Your account was deleted.")).toBeVisible();
    await signIn(page, owner);
    await expect(formAlert(page)).toContainText("don't match");

    await guest.page.goto(`/d/${documentId}`);
    await expect(guest.page.getByRole("textbox", { name: "Document body" })).toContainText("Written before leaving.");
    await guest.page.goto(`/d/${documentId}/history`);
    await expect(guest.page.getByText("Deleted user").first()).toBeVisible();
    await guest.context.close();
  });
});
