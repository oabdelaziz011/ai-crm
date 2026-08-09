/**
 * Sprint 4.6 browser verification — captures screenshots for opportunity create workflow.
 */
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../.verification-screenshots");
mkdirSync(outDir, { recursive: true });

const baseUrl = process.env.APP_URL ?? "http://localhost:5173";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

async function shot(name: string) {
  const path = resolve(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`SCREENSHOT_OK ${path}`);
}

await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
await page.getByLabel(/email/i).fill("demo-platform@vaultos.local");
await page.getByLabel(/password/i).fill("DemoVault2026!");
await page.getByRole("button", { name: /sign in|log in/i }).click();
await page.waitForURL(/dashboard/, { timeout: 30000 });

await page.goto(`${baseUrl}/dashboard/opportunities/pipeline`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /new opportunity|إنشاء فرصة/i }).click();
await page.getByRole("dialog").waitFor({ state: "visible" });
await shot("01-manual-create-dialog-en");

await page.getByLabel(/opportunity name|اسم الفرصة/i).fill("Sprint 4.6 Browser Verify");
await page.locator("#opp-create-amount").fill("75000");
await page.locator("#opp-create-close").fill("2026-12-31");
await shot("02-manual-create-filled-en");

await page.keyboard.press("Escape");
await page.waitForTimeout(500);

await page.goto(`${baseUrl}/dashboard/leads/table`, { waitUntil: "networkidle" });
const leadRow = page.locator("tr", { hasText: "omar12@gmail.com" });
await leadRow.getByRole("button", { name: /lead actions/i }).click();
await page.getByRole("menuitem", { name: /create opportunity|إنشاء فرصة/i }).click();
await page.getByRole("dialog").waitFor({ state: "visible" });
await shot("03-from-lead-duplicate-or-customer");

await page.evaluate(() => localStorage.setItem("i18nextLng", "ar"));
await page.reload({ waitUntil: "networkidle" });
await page.goto(`${baseUrl}/dashboard/opportunities/pipeline`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /new opportunity|فرصة/i }).click();
await page.getByRole("dialog").waitFor({ state: "visible" });
await shot("04-manual-create-dialog-ar");

console.log("BROWSER_VERIFY_OK");
await browser.close();
