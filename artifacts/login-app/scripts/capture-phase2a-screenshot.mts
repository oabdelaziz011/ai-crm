/**
 * Fresh Phase 2a screenshot: login, open CNV-000010, capture button chips.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../../..");
const outPath = resolve(projectRoot, "artifacts/live-phase2a-cnv-000010-buttons.png");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

try {
  await page.goto("http://localhost:5173/login", { waitUntil: "networkidle", timeout: 60000 });
  await page.fill('input[placeholder="you@example.com"]', "demo-platform@vaultos.local");
  await page.fill('input[placeholder="••••••••"]', "DemoVault2026!");
  await page.click('button:has-text("Authenticate")');
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
  await page.goto("http://localhost:5173/dashboard/omnichannel", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);

  const cnv = page.locator("button").filter({ hasText: "CNV-000010" }).first();
  await cnv.waitFor({ timeout: 20000 });
  await cnv.click();
  await page.waitForTimeout(2000);

  const buttonBubble = page.locator(".rounded-xl.border.px-3.py-2.text-sm").filter({ hasText: "please press on what you want" }).last();
  await buttonBubble.waitFor({ timeout: 15000 });
  await buttonBubble.scrollIntoViewIfNeeded();

  const chips = buttonBubble.locator("span.rounded-full");
  const chipTexts = await chips.allTextContents();
  console.log("chip texts:", chipTexts);

  await buttonBubble.screenshot({ path: outPath });
  console.log("saved:", outPath);
} finally {
  await browser.close();
}
