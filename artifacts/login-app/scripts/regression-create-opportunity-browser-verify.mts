/**
 * Regression browser verification — Create Opportunity action + dialog positioning.
 * Set VERIFY_FROM=kanban to skip already-passed table step.
 */
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../.verification-screenshots");
mkdirSync(outDir, { recursive: true });

const baseUrl = process.env.APP_URL ?? "http://localhost:5173";
const startFrom = process.env.VERIFY_FROM ?? "table";
const consoleErrors: string[] = [];

async function shot(page: Page, name: string) {
  const path = resolve(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`SCREENSHOT_OK ${path}`);
}

async function login(page: Page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/identity|email/i).fill("demo-platform@vaultos.local");
  await page.getByLabel(/passkey|password/i).fill("DemoVault2026!");
  await page.getByRole("button", { name: /authenticate|sign in|log in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 30000 });
}

async function assertDialogCentered(page: Page) {
  const dialog = page.locator('[role="dialog"]').last();
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  const box = await dialog.boundingBox();
  if (!box) throw new Error("Dialog has no bounding box");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("No viewport");
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const vpCenterX = viewport.width / 2;
  const vpCenterY = viewport.height / 2;
  const dx = Math.abs(centerX - vpCenterX);
  const dy = Math.abs(centerY - vpCenterY);
  console.log(
    `DIALOG_POSITION center=(${centerX.toFixed(0)},${centerY.toFixed(0)}) viewport=(${vpCenterX},${vpCenterY}) delta=(${dx.toFixed(0)},${dy.toFixed(0)})`,
  );
  if (dx > viewport.width * 0.15 || dy > viewport.height * 0.2) {
    throw new Error(`Dialog not centered: delta (${dx}, ${dy})`);
  }
  console.log("DIALOG_OVERLAY_OK");
}

async function findKanbanCard(page: Page) {
  const byEmail = page.locator("article, [data-kanban-card], div.group").filter({ hasText: "omar12@gmail.com" });
  if ((await byEmail.count()) > 0) return byEmail.first();
  const anyCard = page.locator("article, [data-kanban-card], div.group").filter({ hasText: /EGP|Qualified|Lead/i });
  await anyCard.first().waitFor({ state: "visible", timeout: 15000 });
  return anyCard.first();
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(err.message));

await login(page);

if (startFrom === "table") {
  await page.goto(`${baseUrl}/dashboard/leads/table`, { waitUntil: "networkidle" });
  const leadRow = page.locator("tr", { hasText: "omar12@gmail.com" }).first();
  await leadRow.waitFor({ state: "visible", timeout: 15000 });
  await leadRow.getByRole("button", { name: /lead actions/i }).click();
  const tableCreateItem = page.getByRole("menuitem", { name: /create opportunity|إنشاء فرصة/i });
  await tableCreateItem.waitFor({ state: "visible", timeout: 5000 });
  console.log("TABLE_CREATE_ACTION_OK");
  await tableCreateItem.click();
  await assertDialogCentered(page);
  await shot(page, "regression-01-table-create-dialog-centered");
  await page.getByRole("button", { name: /cancel|إلغ/i }).click();
  await page.locator('[role="dialog"]').waitFor({ state: "hidden", timeout: 5000 });
  console.log("TABLE_DIALOG_CLOSE_OK");
} else {
  console.log("TABLE_CREATE_ACTION_SKIP already verified");
}

if (startFrom === "table" || startFrom === "kanban") {
  await page.goto(`${baseUrl}/dashboard/leads/kanban`, { waitUntil: "networkidle" });
  const kanbanCard = await findKanbanCard(page);
  await kanbanCard.hover();
  await kanbanCard.getByRole("button", { name: /create opportunity|إنشاء فرصة/i }).click();
  console.log("KANBAN_CREATE_ACTION_OK");
  await assertDialogCentered(page);
  await shot(page, "regression-02-kanban-create-dialog-centered");
  await page.getByRole("button", { name: /cancel|إلغ/i }).click();
  await page.locator('[role="dialog"]').waitFor({ state: "hidden", timeout: 5000 });
  console.log("KANBAN_DIALOG_CLOSE_OK");
} else {
  console.log("KANBAN_CREATE_ACTION_SKIP already verified");
}

await page.goto(`${baseUrl}/dashboard/leads/table`, { waitUntil: "networkidle" });
const leadNameBtn = page
  .locator("tr", { hasText: "omar12@gmail.com" })
  .getByRole("button")
  .filter({ hasNot: page.getByRole("button", { name: /lead actions/i }) })
  .first();
await leadNameBtn.click();
await page.locator('[role="dialog"]').first().waitFor({ state: "visible", timeout: 15000 });
await page.getByText(/loading|جاري/i).waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
const lead360CreateBtn = page.getByRole("button", { name: /create opportunity|إنشاء فرصة/i });
await lead360CreateBtn.waitFor({ state: "visible", timeout: 20000 });
console.log("LEAD360_CREATE_ACTION_OK");
await lead360CreateBtn.click();
await assertDialogCentered(page);
await shot(page, "regression-03-lead360-create-dialog-centered");
await page.getByRole("button", { name: /cancel|إلغ/i }).click();
await page.locator('[role="dialog"]').last().waitFor({ state: "hidden", timeout: 5000 });
console.log("LEAD360_DIALOG_CLOSE_OK");

if (consoleErrors.length > 0) {
  console.log("CONSOLE_ERRORS", JSON.stringify(consoleErrors.slice(0, 10)));
  throw new Error(`Console errors detected: ${consoleErrors.length}`);
}
console.log("CONSOLE_ERRORS_NONE");
console.log("BROWSER_VERIFY_OK");
await browser.close();
