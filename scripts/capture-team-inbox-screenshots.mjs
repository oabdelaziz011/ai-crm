/**
 * Capture Team Inbox + Customer Details screenshots for verification report.
 * Usage: node scripts/capture-team-inbox-screenshots.mjs [conversationSearch]
 */
import { chromium } from "playwright";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "docs/architecture/screenshots");
mkdirSync(outDir, { recursive: true });

const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const search = process.argv[2] ?? "742227";
const email = "demo-platform@vaultos.local";
const password = "DemoVault2026!";
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: auth, error } = await sb.auth.signInWithPassword({ email, password });
if (error) throw error;

const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
const sessionJson = JSON.stringify(auth.session);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
await page.evaluate(
  ({ storageKey, sessionJson }) => {
    localStorage.setItem(storageKey, sessionJson);
  },
  { storageKey, sessionJson },
);

await page.goto("http://localhost:5173/dashboard/inbox", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"]').first();
if (await searchInput.count()) {
  await searchInput.fill(search);
  await page.waitForTimeout(1500);
}

await page.screenshot({ path: resolve(outDir, "01-team-inbox-conversation-list.png"), fullPage: true });

const convItem = page.getByText(/CNV-000031|Link Verify 742227/i).first();
if (await convItem.count()) {
  await convItem.click();
  await page.waitForTimeout(1500);
}

await page.screenshot({ path: resolve(outDir, "02-team-inbox-conversation-thread.png"), fullPage: true });

const viewCustomer = page.getByRole("button", { name: /customer|view customer|details/i }).first();
if (await viewCustomer.count()) {
  await viewCustomer.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(outDir, "03-customer-details-dialog.png"), fullPage: true });
} else {
  console.warn("View Customer button not found");
}

await browser.close();
console.log("Screenshots saved to", outDir);
