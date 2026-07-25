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
const { data: after } = await admin.from("profiles").select("company_id").eq("id", demoUserId).single();
console.log("profile company before/after", before, after);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://localhost:5173/login");
await page.evaluate(async ({ url, key }) => {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.110.2");
  await createClient(url, key).auth.signInWithPassword({
    email: "demo-platform@vaultos.local",
    password: "DemoVault2026!",
  });
}, { url, key });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(5000);
console.log("url after reload", page.url());
await page.goto("http://localhost:5173/dashboard/inbox", { waitUntil: "networkidle" });
await page.waitForTimeout(5000);
const text = await page.textContent("body");
console.log("has CNV-000031", text?.includes("CNV-000031"));
console.log("snippet", text?.slice(0, 500));
await browser.close();
await admin.from("profiles").update({ company_id: before?.company_id ?? null }).eq("id", demoUserId);
