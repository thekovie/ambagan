import { expect, test, type Browser, type Page } from "@playwright/test";
import { startBillingThisMonth } from "./db";
import { linkIn, waitForMail } from "./mail";

const BASE_URL = "http://localhost:3100";
const ADMIN = "admin@e2e.test";
const MEMBER = "ana@e2e.test";

async function newPage(browser: Browser, violations: string[]): Promise<Page> {
  const page = await (await browser.newContext({ baseURL: BASE_URL })).newPage();
  // The production CSP must not block anything the app needs, including the receipt scanner's worker and WebAssembly.
  page.on("console", (message) => {
    if (/content security policy/i.test(message.text())) violations.push(message.text());
  });
  return page;
}

/** Signs in the way a person does: ask for a link, read it from the email, open it. */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const mail = await waitForMail(email, /sign-in link/i);
  await page.goto(linkIn(mail, `${BASE_URL}/api/auth/callback/`));
}

/** A receipt drawn in the browser (nothing is read from disk): synthetic, with a current Manila date. */
async function receiptPng(page: Page, amount: string, reference: string): Promise<Buffer> {
  const when = new Date(Date.now() - 60 * 60 * 1000);
  const dateLine = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(when)
    .replace(/, (\d)/, " $1");
  const dataUrl = await page.evaluate(
    ({ lines }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 700;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 900, 700);
      ctx.fillStyle = "#000";
      ctx.font = "bold 44px Arial";
      lines.forEach((line, i) => ctx.fillText(line, 50, 90 + i * 95));
      return canvas.toDataURL("image/png");
    },
    { lines: ["GCash", "Express Send", "Sent via GCash", `Amount ${amount}`, `Ref No. ${reference}`, dateLine] },
  );
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

test.describe.configure({ mode: "serial" });

test("a member is invited, pays with a scanned receipt, and the admin verifies it", async ({ browser }) => {
  const violations: string[] = [];
  const admin = await newPage(browser, violations);
  const member = await newPage(browser, violations);

  await test.step("the admin signs in with an emailed link", async () => {
    await signIn(admin, ADMIN);
    await admin.goto("/admin/dashboard");
    await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
  });

  await test.step("the admin switches on a payment method members can pay", async () => {
    await admin.goto("/admin/settings");
    const gcash = admin.getByRole("region", { name: "GCash" });
    await gcash.getByLabel("Account holder").fill("Kovie D.");
    await gcash.getByLabel("Account number or identifier").fill("09171234567");
    await gcash.getByLabel("Show this to members").check();
    await gcash.getByRole("button", { name: "Save" }).click();
    await expect(gcash.getByText("Saved.")).toBeVisible();
  });

  await test.step("the admin invites a member, who is emailed an invitation", async () => {
    await admin.goto("/admin/members");
    await admin.getByLabel("Name").fill("Ana Reyes");
    await admin.getByLabel("Email").fill(MEMBER);
    await admin.getByRole("button", { name: "Add and send invite" }).click();
    await expect(admin.getByText(`Invitation emailed to ${MEMBER}.`)).toBeVisible();
  });

  await test.step("the member accepts the invitation and signs in", async () => {
    const invitation = await waitForMail(MEMBER, /invited/i);
    await member.goto(linkIn(invitation, `${BASE_URL}/invite/`));
    await expect(member.getByRole("heading", { name: "Hi Ana, you're in" })).toBeVisible();
    await member.getByRole("button", { name: "Accept and email me a link" }).click();
    const signInMail = await waitForMail(MEMBER, /sign-in link/i);
    await member.goto(linkIn(signInMail, `${BASE_URL}/api/auth/callback/`));
    await expect(member.getByRole("heading", { name: "Hi, Ana" })).toBeVisible();
  });

  await test.step("the admin issues this month's statements; the member sees theirs", async () => {
    // Joining after the plan's due day means first billing next month (a rule with its own unit tests), so on most
    // days of the month this member would have nothing to pay yet. State the precondition: they joined earlier.
    startBillingThisMonth(MEMBER);
    await admin.goto("/admin/statements");
    await admin.getByRole("button", { name: "Generate missing statements" }).click();
    await expect(admin.getByText(/Created 1 statement/)).toBeVisible();
    await member.reload();
    await expect(member.getByText("₱50.00").first()).toBeVisible();
  });

  await test.step("the member scans a receipt and sends the payment for checking", async () => {
    await member.getByRole("link", { name: /Submit payment/ }).first().click();
    await expect(member.getByRole("heading", { name: /Scan your receipt/ })).toBeVisible();
    await member.locator('input[type="file"]').setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: await receiptPng(member, "50.00", "7034 512 840193"),
    });
    await expect(member.getByText(/Filled in:/)).toBeVisible({ timeout: 90_000 });
    await expect(member.getByLabel("Amount sent (₱)")).toHaveValue("50.00");
    await expect(member.getByLabel("Reference number")).not.toHaveValue("");

    await member.getByRole("radio", { name: /GCash/ }).check();
    await member.getByRole("button", { name: "Send for checking" }).click();
    await expect(member).toHaveURL(/\/payments\?sent=1/);
    await expect(member.getByText("Waiting for check")).toBeVisible();
  });

  await test.step("emails go out: a confirmation to the member and a verification request to the admin", async () => {
    await waitForMail(MEMBER, /We got your payment report/);
    await waitForMail(ADMIN, /reported a payment of ₱50\.00/);
  });

  await test.step("the admin checks the money and approves", async () => {
    await admin.goto("/admin/payments");
    await expect(admin.getByText("Waiting for you (1)")).toBeVisible();
    await expect(admin.getByText("Ana Reyes").first()).toBeVisible();
    await admin.getByRole("button", { name: /Money arrived: approve/ }).click();
    await admin.getByRole("button", { name: /Sure\? Mark paid/ }).click();
    await expect(admin.getByText("Waiting for you (0)")).toBeVisible();
  });

  await test.step("the member sees it paid and is emailed", async () => {
    await member.goto("/payments");
    await expect(member.getByText("Approved")).toBeVisible();
    await member.goto("/statements");
    await expect(member.getByText("Paid", { exact: true }).first()).toBeVisible();
    await waitForMail(MEMBER, /Payment confirmed/);
  });

  await test.step("people move around with the floating dock (there is no sidebar)", async () => {
    // Member: the dock is the main navigation, and the current page is marked.
    await member.goto("/dashboard");
    const memberDock = member.getByRole("navigation", { name: "Main" });
    await memberDock.getByRole("link", { name: "Statements" }).click();
    await expect(member).toHaveURL(/\/statements$/);
    await expect(memberDock.getByRole("link", { name: "Statements" })).toHaveAttribute("aria-current", "page");
    await memberDock.getByRole("link", { name: "History" }).click();
    await expect(member).toHaveURL(/\/payments$/);

    // Admin: three destinations in the dock, the rest behind "More".
    await admin.goto("/admin/dashboard");
    const adminDock = admin.getByRole("navigation", { name: "Admin" });
    await expect(adminDock.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await adminDock.getByRole("button", { name: "More" }).click();
    await admin.getByRole("navigation", { name: "More admin pages" }).getByRole("link", { name: "Members" }).click();
    await expect(admin).toHaveURL(/\/admin\/members$/);

    // Account menu: sign out lives here on every screen size.
    await member.getByRole("button", { name: "Account menu" }).click();
    await expect(member.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
    await member.keyboard.press("Escape");
    await expect(member.getByRole("menuitem", { name: "Sign out" })).toBeHidden();
  });

  await test.step("the admin's email log shows what was sent", async () => {
    await admin.goto("/admin/notifications");
    await expect(admin.getByText(/Payment approved/).first()).toBeVisible();
    // The totals tile for failed messages reads 0 (every message was accepted by the SMTP sink).
    await expect(admin.locator("dl > div").filter({ hasText: "Failed" }).locator("dd")).toHaveText("0");
  });

  await test.step("signing out from the account menu ends the session", async () => {
    await member.getByRole("button", { name: "Account menu" }).click();
    await member.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(member).toHaveURL(/\/login/);
  });

  expect(violations, "the CSP blocked something").toEqual([]);
});
