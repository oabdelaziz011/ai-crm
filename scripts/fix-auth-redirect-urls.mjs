#!/usr/bin/env node
/**
 * Fix Supabase Auth Site URL + redirect allow-list so password-reset emails
 * land on the Vite app (5173), not api-server (3000).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/fix-auth-redirect-urls.mjs
 *
 * Or sign in with `npx supabase login` and set SUPABASE_ACCESS_TOKEN from the dashboard.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const PROJECT_REF = "lfbtnskmvibikalsxwsm";

function loadEnv() {
  const env = { ...process.env };
  for (const p of [resolve(root, "artifacts/login-app/.env.local"), resolve(root, ".env")]) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && env[m[1]] == null) env[m[1]] = m[2];
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

const URI_ALLOW_LIST = [
  "http://localhost:5173/**",
  "http://127.0.0.1:5173/**",
  "http://localhost:5173/auth/callback",
  "http://127.0.0.1:5173/auth/callback",
  "http://localhost:5173/reset-password",
  "http://127.0.0.1:5173/reset-password",
  "https://valueor.org/**",
  "https://app.valueor.org/**",
].join(",");

async function main() {
  const env = loadEnv();
  const token = (env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_MANAGEMENT_TOKEN || "").trim();
  if (!token) {
    console.error(`Missing SUPABASE_ACCESS_TOKEN.

1. Open https://supabase.com/dashboard/account/tokens and create a token
2. Run:
   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/fix-auth-redirect-urls.mjs

Or in the Dashboard → Authentication → URL Configuration set:
  Site URL: http://localhost:5173
  Redirect URLs: include http://localhost:5173/** and http://127.0.0.1:5173/**
`);
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const currentRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    headers,
  });
  const current = await currentRes.json();
  if (!currentRes.ok) {
    console.error("Failed to read auth config:", currentRes.status, current);
    process.exit(1);
  }

  console.log("Before:", {
    site_url: current.site_url,
    uri_allow_list: current.uri_allow_list,
  });

  const patchRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      site_url: "http://localhost:5173",
      uri_allow_list: URI_ALLOW_LIST,
    }),
  });
  const patched = await patchRes.json();
  if (!patchRes.ok) {
    console.error("Failed to patch auth config:", patchRes.status, patched);
    process.exit(1);
  }

  console.log("After:", {
    site_url: patched.site_url,
    uri_allow_list: patched.uri_allow_list,
  });
  console.log("Done. Request a new password-reset email (old links may still point at :3000).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
