import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const env: Record<string, string> = {};
  for (const filePath of ["artifacts/login-app/.env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(filePath), "utf8").split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match) env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

function pickDefault<T extends { is_default?: boolean; is_enabled?: boolean }>(connections: T[]): T | null {
  return (
    connections.find((item) => item.is_default && item.is_enabled) ??
    connections.find((item) => item.is_enabled) ??
    null
  );
}

const env = { ...loadEnv(), ...process.env };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.log(JSON.stringify({ error: "no_supabase_env" }, null, 2));
  process.exit(0);
}

const client = createClient(url, key);
const { data: profiles } = await client.from("profiles").select("company_id").limit(1);
const companyId = profiles?.[0]?.company_id as string | undefined;

if (!companyId) {
  console.log(JSON.stringify({ error: "no_profile" }, null, 2));
  process.exit(0);
}

const { data: assistant } = await client
  .from("ai_assistant_settings")
  .select("id, provider, model, is_enabled, knowledge_enabled")
  .eq("company_id", companyId)
  .is("deleted_at", null)
  .maybeSingle();

const { data: connections } = await client
  .from("ai_provider_connections")
  .select("id, display_name, is_enabled, is_default, provider_id")
  .eq("company_id", companyId)
  .is("deleted_at", null)
  .eq("is_enabled", true);

const providerConnection = pickDefault(connections ?? []);

console.log(
  JSON.stringify(
    {
      companyId,
      ai_assistant_settings: assistant,
      ai_provider_connections_enabled: connections ?? [],
      useRuntimeChatConfigReturn: {
        providerConnectionId: providerConnection?.id ?? null,
        ready: Boolean(providerConnection),
        missing: providerConnection ? [] : ["provider"],
        knowledgeRetrieval: null,
      },
      note: "providerConfigured is not a field; use ready instead",
    },
    null,
    2,
  ),
);
