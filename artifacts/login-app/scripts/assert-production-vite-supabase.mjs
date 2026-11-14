/**
 * Fail CI/production frontend packaging when VITE_SUPABASE_URL is localhost.
 * Usage: node artifacts/login-app/scripts/assert-production-vite-supabase.mjs [path-to-.env.local-or-dist-index.js]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { isLocalSupabaseUrl, isProductionSupabaseUrl } from "../../../scripts/lib/env-mode.mjs";

const target = resolve(process.argv[2] ?? resolve("artifacts/login-app/.env.local"));
if (!existsSync(target)) {
  console.error(`Missing target: ${target}`);
  process.exit(1);
}

const text = readFileSync(target, "utf8");
let url = null;
const envMatch = text.match(/^VITE_SUPABASE_URL=(.*)$/m);
if (envMatch) {
  url = envMatch[1].trim().replace(/^["']|["']$/g, "");
} else {
  // Vite may bake either the env key form or the raw hosted URL into chunks.
  const baked =
    text.match(/VITE_SUPABASE_URL:"([^"]*)"/) ||
    text.match(/https:\/\/[a-z0-9-]+\.supabase\.co/);
  url = baked?.[1] ?? baked?.[0] ?? null;
}

if (!url) {
  console.error("Could not find VITE_SUPABASE_URL (or hosted supabase.co URL) in target");
  process.exit(1);
}

if (isLocalSupabaseUrl(url) || /127\.0\.0\.1|localhost/i.test(url)) {
  console.error("Refusing production package: VITE_SUPABASE_URL points at local Supabase");
  process.exit(2);
}

if (!isProductionSupabaseUrl(url)) {
  console.error("Refusing production package: VITE_SUPABASE_URL is not *.supabase.co");
  process.exit(2);
}

console.log("OK: VITE_SUPABASE_URL is a hosted Supabase URL");
