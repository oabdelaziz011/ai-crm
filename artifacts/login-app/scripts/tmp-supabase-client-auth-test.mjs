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
const res = await page.evaluate(
  async ({ url, key }) => {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
    const sb = createClient(url, key);
    const { data, error } = await sb.auth.signInWithPassword({
      email: "demo-platform@vaultos.local",
      password: "DemoVault2026!",
    });
    return {
      ok: !error,
      error: error ? { message: error.message, code: error.code, status: error.status } : null,
      userId: data.session?.user?.id ?? null,
    };
  },
  { url, key },
);
console.log(JSON.stringify(res, null, 2));
await browser.close();
