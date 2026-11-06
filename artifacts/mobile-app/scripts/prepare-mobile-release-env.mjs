import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assessMobileBuildTarget } from "../src/lib/preview-target.js";
import { recordedProductionSupabaseOrigin } from "../../../scripts/lib/env-mode.mjs";

const PRODUCTION_API_URL = "https://api.valueor.org";

export function selectReleasePublicConfig(input) {
  const supabaseUrl = String(input.supabaseUrl ?? "").trim().replace(/\/+$/, "");
  const publishableKey = String(input.publishableKey ?? "").trim();
  if (!supabaseUrl || !publishableKey) return { ok: false, code: "missing_config" };
  const target = assessMobileBuildTarget({
    profile: "production",
    apiUrl: PRODUCTION_API_URL,
    supabaseUrl,
    supabasePublishableKey: publishableKey,
    recordedProductionHost: input.recordedProductionHost,
  });
  if (!target.ok) return target;
  return {
    ok: true,
    env: {
      EAS_BUILD_PROFILE: "production",
      EXPO_PUBLIC_API_URL: PRODUCTION_API_URL,
      EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    },
  };
}

function parseEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function writeReleaseEnv() {
  const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const rootEnv = parseEnv(path.resolve(mobileRoot, "../../.env"));
  const selected = selectReleasePublicConfig({
    supabaseUrl: rootEnv.VITE_SUPABASE_URL,
    publishableKey: rootEnv.VITE_SUPABASE_PUBLISHABLE_KEY || rootEnv.SUPABASE_PUBLISHABLE_KEY,
    recordedProductionHost: new URL(recordedProductionSupabaseOrigin()).hostname,
  });
  if (!selected.ok) {
    console.error(`mobile release public config rejected (${selected.code})`);
    process.exit(1);
  }
  const body = Object.entries(selected.env).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
  fs.writeFileSync(path.join(mobileRoot, ".env.production"), body, { encoding: "utf8" });
  console.log("mobile release public config prepared");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeReleaseEnv();
}
