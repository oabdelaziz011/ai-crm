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

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const companyId = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const demoUserId = "d0000001-0001-4001-8001-000000000001";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data: before } = await admin.from("profiles").select("company_id").eq("id", demoUserId).single();
await admin.from("profiles").update({ company_id: companyId }).eq("id", demoUserId);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
await page.evaluate(async ({ url, key }) => {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.110.2");
  await createClient(url, key).auth.signInWithPassword({
    email: "demo-platform@vaultos.local",
    password: "DemoVault2026!",
  });
}, { url, key });

await page.goto("http://localhost:5173/dashboard/inbox", { waitUntil: "networkidle" });
await page.waitForTimeout(8000);

const searchInput = page.locator("input.bg-transparent.text-sm").first();
await searchInput.fill("CNV-000031");
await page.waitForTimeout(2000);

await page.screenshot({ path: resolve(outDir, "01-team-inbox-conversation-list.png"), fullPage: true });

const conv = page.getByText("CNV-000031").first();
if (await conv.count()) await conv.click();
await page.waitForTimeout(2000);
await page.screenshot({ path: resolve(outDir, "02-team-inbox-conversation-thread.png"), fullPage: true });

const viewCustomer = page.getByRole("button", { name: /view customer/i }).first();
if (await viewCustomer.count()) {
  await viewCustomer.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(outDir, "03-customer-details-dialog.png"), fullPage: true });
}

await browser.close();
await admin.from("profiles").update({ company_id: before?.company_id ?? null }).eq("id", demoUserId);
console.log("done");
