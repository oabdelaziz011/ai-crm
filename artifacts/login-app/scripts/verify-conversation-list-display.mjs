/**
 * Verify Team Inbox list shows customer phone (not age) for CNV-000031.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
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
await page.goto("http://localhost:5173/login");
await page.evaluate(async ({ url, key }) => {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.110.2");
  await createClient(url, key).auth.signInWithPassword({
    email: "demo-platform@vaultos.local",
    password: "DemoVault2026!",
  });
}, { url, key });

await page.goto("http://localhost:5173/dashboard/inbox", { waitUntil: "networkidle" });
await page.waitForTimeout(5000);

const searchInput = page.locator("input.bg-transparent.text-sm").first();
await searchInput.fill("CNV-000031");
await page.waitForTimeout(2000);

const rowText = await page.locator("button").filter({ hasText: "CNV-000031" }).first().innerText();
console.log("ROW TEXT:\n", rowText);
console.log("HAS_PHONE", rowText.includes("01154742227"));
console.log("HAS_NAME", rowText.includes("Link Verify 742227"));
console.log("SUBTITLE_IS_AGE_ONLY", /^55$/m.test(rowText.split("\n").map((l) => l.trim()).find((l) => l === "55") ?? ""));

await browser.close();
await admin.from("profiles").update({ company_id: before?.company_id ?? null }).eq("id", demoUserId);

process.exit(
  rowText.includes("01154742227") && rowText.includes("Link Verify 742227") ? 0 : 1,
);
