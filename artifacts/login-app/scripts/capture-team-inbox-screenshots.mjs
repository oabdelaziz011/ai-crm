/**
 * Capture Team Inbox + Customer Details screenshots using login-app's Playwright.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
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
const conversationCompanyId = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const demoUserId = "d0000001-0001-4001-8001-000000000001";
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

// Scope demo user to the WhatsApp company for inbox visibility (restored after capture).
const admin = serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;
let previousCompanyId = null;
if (admin) {
  const { data: profile } = await admin.from("profiles").select("company_id").eq("id", demoUserId).single();
  previousCompanyId = profile?.company_id ?? null;
  await admin.from("profiles").update({ company_id: conversationCompanyId }).eq("id", demoUserId);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
await page.evaluate(
  async ({ url, key }) => {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.110.2");
    const { error } = await createClient(url, key).auth.signInWithPassword({
      email: "demo-platform@vaultos.local",
      password: "DemoVault2026!",
    });
    if (error) throw new Error(error.message);
  },
  { url, key },
);

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(4000);
console.log("After reload URL:", page.url());

if (!page.url().includes("/dashboard")) {
  await page.goto("http://localhost:5173/dashboard/omnichannel", { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
}
console.log("Dashboard URL:", page.url());

const searchInput = page.locator("input.bg-transparent.text-sm").first();
if (await searchInput.count()) {
  await searchInput.fill(search);
  await page.waitForTimeout(1500);
}

await page.screenshot({ path: resolve(outDir, "01-team-inbox-conversation-list.png"), fullPage: true });

const convItem = page.getByText(/CNV-000031|Link Verify 742227/i).first();
if (await convItem.count()) {
  await convItem.click();
  await page.waitForTimeout(2000);
} else {
  console.warn("Conversation CNV-000031 not found in list");
}

await page.screenshot({ path: resolve(outDir, "02-team-inbox-conversation-thread.png"), fullPage: true });

const viewCustomer = page.getByRole("button", { name: /view customer|customer details/i }).first();
if (await viewCustomer.count()) {
  await viewCustomer.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(outDir, "03-customer-details-dialog.png"), fullPage: true });
} else {
  console.warn("View Customer button not found");
}

await browser.close();

if (admin) {
  await admin.from("profiles").update({ company_id: previousCompanyId }).eq("id", demoUserId);
}

console.log("Screenshots saved:", outDir);
