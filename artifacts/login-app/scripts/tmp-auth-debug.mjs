import { chromium } from "playwright";
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

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:5173/login");
await page.evaluate(async ({ url, key }) => {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.110.2");
  await createClient(url, key).auth.signInWithPassword({
    email: "demo-platform@vaultos.local",
    password: "DemoVault2026!",
  });
}, { url, key });

const before = await page.evaluate(() => Object.keys(localStorage));
console.log("keys after sign-in", before);

await page.goto("http://localhost:5173/dashboard/omnichannel", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
console.log("final url", page.url());
console.log("body snippet", (await page.textContent("body"))?.slice(0, 200));
await browser.close();
