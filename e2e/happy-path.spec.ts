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

/** A shop receipt drawn in the browser: item names on the left, prices right-aligned like a printed column. */
async function billPng(page: Page, rows: [string, string][]): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ rows }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 120 + rows.length * 80;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000";
      ctx.font = "bold 40px Arial";
      rows.forEach(([label, price], i) => {
        ctx.textAlign = "left";
        ctx.fillText(label, 40, 80 + i * 80);
        ctx.textAlign = "right";
        ctx.fillText(price, 860, 80 + i * 80);
      });
      return canvas.toDataURL("image/png");
    },
    { rows },
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
    // The page also has a form for friends without an account, so aim at the member form's own section.
    const addMember = admin.getByRole("region", { name: "Add a friend" });
    await addMember.getByLabel("Name").fill("Ana Reyes");
    await addMember.getByLabel("Email").fill(MEMBER);
    await addMember.getByRole("button", { name: "Add and send invite" }).click();
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
    await expect(admin.getByRole("link", { name: "Verify, 1 waiting" })).toBeVisible();
    await expect(admin.getByText("Ana Reyes").first()).toBeVisible();
    await admin.getByRole("button", { name: /Money arrived: approve/ }).click();
    await admin.getByRole("button", { name: /Sure\? Mark paid/ }).click();
    await expect(admin.getByText("Waiting for you (0)")).toBeVisible();
    // The dock's count follows the queue without a manual reload.
    await expect(admin.getByRole("link", { name: "Verify", exact: true })).toBeVisible();
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

    // Admin: the things done most (overview, ambag, verify) are in the dock, the rest behind "More".
    await admin.goto("/admin/dashboard");
    const adminDock = admin.getByRole("navigation", { name: "Admin" });
    await expect(adminDock.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(adminDock.getByRole("link", { name: "Ambag" })).toBeVisible();
    await adminDock.getByRole("button", { name: "More" }).click();
    await admin.getByRole("navigation", { name: "More admin pages" }).getByRole("link", { name: "Members" }).click();
    await expect(admin).toHaveURL(/\/admin\/members$/);

    // Account menu: sign out lives here on every screen size.
    await member.getByRole("button", { name: "Account menu" }).click();
    await expect(member.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
    await member.keyboard.press("Escape");
    await expect(member.getByRole("menuitem", { name: "Sign out" })).toBeHidden();
  });

  await test.step("an ambag: the admin splits a bill with a friend who has no account, who pays through a private link", async () => {
    await admin.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await admin.goto("/admin/ambag/new");
    await admin.getByLabel("What was it for?").fill("Karaoke night");
    await admin.getByLabel("Total you paid (₱)").fill("600");
    await admin.getByRole("checkbox", { name: "Ana Reyes" }).check();
    await admin.getByText("Add a friend who has no account").click();
    await admin.getByLabel("Name", { exact: true }).fill("Tito Boy");
    await admin.getByRole("button", { name: "Add friend" }).click();
    await expect(admin.getByRole("checkbox", { name: /Tito Boy/ })).toBeChecked();
    // Admin, Ana and Tito split it equally: 200 each, and the form says so before anything is sent.
    await expect(admin.getByText("Balanced: ₱600.00 split between 3").first()).toBeVisible();
    await admin.getByRole("button", { name: "Create ambag" }).click();
    await expect(admin.getByRole("heading", { level: 1, name: "Karaoke night" })).toBeVisible();
    await expect(admin.getByText(/your own share is ₱200\.00/)).toBeVisible();

    // The guest's link, copied the way the admin would.
    await admin.getByRole("button", { name: "Copy link for Tito Boy" }).click();
    const link = await admin.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\/s\/[0-9a-f-]{36}\.0\./);

    // A different browser with no session: sees only their own share, nobody else's, and can pay.
    const guest = await newPage(browser, violations);
    await guest.goto(link);
    await expect(guest.getByRole("heading", { level: 1, name: "Karaoke night" })).toBeVisible();
    await expect(guest.getByText("₱200.00").first()).toBeVisible();
    await expect(guest.locator("body")).not.toContainText("Ana");
    await guest.getByLabel("Reference number").fill("TITO 1234 5678");
    await guest.getByRole("button", { name: "Send for checking" }).click();
    await expect(guest.getByText(/Sent\. The admin will check/)).toBeVisible();

    // The admin verifies it like any other payment, and the guest's page then reads as settled.
    await admin.goto("/admin/payments");
    await expect(admin.getByText("Waiting for you (1)")).toBeVisible();
    await expect(admin.getByText("Tito Boy").first()).toBeVisible();
    await admin.getByRole("button", { name: /Money arrived: approve/ }).click();
    await admin.getByRole("button", { name: /Sure\? Mark paid/ }).click();
    await expect(admin.getByText("Waiting for you (0)")).toBeVisible();
    await guest.reload();
    await expect(guest.getByText(/All settled/)).toBeVisible();

    // A tampered link is a plain 404, and replacing a link kills the old one at once.
    const tampered = await guest.goto(`${link.slice(0, -1)}${link.endsWith("A") ? "B" : "A"}`);
    expect(tampered?.status()).toBe(404);
    await admin.goto("/admin/ambag");
    await expect(admin.getByRole("heading", { level: 1, name: "Ambag" })).toBeVisible();
    await admin.getByRole("link", { name: /Karaoke night/ }).click();
    await admin.getByRole("button", { name: "New link for Tito Boy" }).click();
    await admin.getByRole("button", { name: /Sure\? The old link stops working/ }).click();
    await expect.poll(async () => (await guest.goto(link))?.status()).toBe(404);
    await guest.context().close();

    // Later, the guest asks for an account: "Invite to join" keeps them as the same person, and the result stays on screen
    // even though their row moves from the guests list to the members list.
    await admin.goto("/admin/members");
    const guestsSection = admin.getByRole("region", { name: /Friends without an account/ });
    await guestsSection.getByLabel("Email for Tito Boy").fill("tito@e2e.test");
    await guestsSection.getByRole("button", { name: /Invite to join/ }).click();
    await expect(admin.getByText(/Invitation emailed to tito@e2e\.test/)).toBeVisible();
    await expect(admin.getByRole("region", { name: /^Everyone/ }).getByRole("listitem").filter({ hasText: "Tito Boy" })).toBeVisible();
    await waitForMail("tito@e2e.test", /invited/i);
  });

  await test.step("an itemised ambag: each person pays for what they had, with service and delivery shared", async () => {
    await admin.goto("/admin/ambag/new");
    await admin.getByLabel("What was it for?").fill("Pizza night");
    await admin.getByRole("checkbox", { name: "Ana Reyes" }).check();
    await admin.getByText("By items", { exact: true }).click();
    await admin.getByLabel("Name of item 1").fill("Large pizza");
    await admin.getByLabel("Price of Large pizza in pesos").fill("600");
    await admin.getByRole("group", { name: /Who shared Large pizza/ }).getByRole("button", { name: "Everyone" }).click();
    await admin.getByRole("button", { name: "Add an item" }).click();
    await admin.getByLabel("Name of item 2").fill("Beer bucket");
    await admin.getByLabel("Price of Beer bucket in pesos").fill("300");
    await admin.getByRole("group", { name: /Who shared Beer bucket/ }).getByRole("button", { name: "Ana Reyes" }).click();
    await admin.getByRole("group", { name: "Add a charge or discount" }).getByRole("button", { name: "Service charge" }).click();
    // Items 900, service charge 10% = 90, so 990 in all; the receipt total is checked against it.
    await admin.getByLabel("Total on the receipt (optional)").fill("1000");
    await expect(admin.getByText(/The receipt says ₱1,000\.00 but the items and extras add up to ₱990\.00/).first()).toBeVisible();
    await admin.getByLabel("Total on the receipt (optional)").fill("990");
    await expect(admin.getByText("Balanced: ₱990.00 split between 2").first()).toBeVisible();
    await admin.getByRole("button", { name: "Create ambag" }).click();
    await expect(admin.getByRole("heading", { level: 1, name: "Pizza night" })).toBeVisible();
    // Ana had half the pizza (300) and all the beer (300), plus 10% service: 660. The admin's share is 300 + 30 = 330.
    await expect(admin.getByText(/your own share is ₱330\.00/)).toBeVisible();

    // Ana sees how her own share was worked out, and only hers.
    await member.goto("/statements");
    await expect(member.getByText("Pizza night · Ambag")).toBeVisible();
    await member.getByRole("link", { name: /Pizza night/ }).click();
    await expect(member.getByRole("heading", { level: 1, name: "Pizza night" })).toBeVisible();
    await expect(member.getByRole("heading", { name: "How this was split" })).toBeVisible();
    await expect(member.getByText("Large pizza")).toBeVisible();
    await expect(member.getByText("Beer bucket")).toBeVisible();
    await expect(member.getByText("Service charge")).toBeVisible();
    await expect(member.getByText("₱660.00").first()).toBeVisible();
    await expect(member.getByText("Billing period")).toHaveCount(0);
  });

  await test.step("a photo of a receipt pre-fills the items, the service charge and the receipt total", async () => {
    await admin.goto("/admin/ambag/new");
    await admin.getByText("By items", { exact: true }).click();
    // Items 350.00 + 285.50 + 60.00 = 695.50, plus 10% service charge 69.55, makes 765.05 in all.
    await admin.locator('section[aria-labelledby="bill-scan-heading"] input[type=file]').setInputFiles({
      name: "bill.png",
      mimeType: "image/png",
      buffer: await billPng(admin, [
        ["Sisig", "350.00"],
        ["Adobo", "285.50"],
        ["Rice", "60.00"],
        ["Service Charge 10%", "69.55"],
        ["TOTAL", "765.05"],
      ]),
    });
    await expect(admin.getByText(/Read 3 items and a total of ₱765\.05/)).toBeVisible({ timeout: 90_000 });
    await expect(admin.getByLabel("Total on the receipt (optional)")).toHaveValue("765.05");
    await expect(admin.getByLabel("Price of Sisig in pesos")).toHaveValue("350.00");
    await expect(admin.getByRole("button", { name: /^Remove Service charge/i })).toBeVisible();
    // Nobody is chosen for the scanned items yet: that is the admin's call.
    await expect(admin.getByText("Choose who shared").first()).toBeVisible();
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
