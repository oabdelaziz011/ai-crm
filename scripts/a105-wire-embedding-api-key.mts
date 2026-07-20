/**
 * Sprint A1-05 infrastructure unblock: ensure embedding connection can resolve OpenAI API key.
 *
 * Resolution order:
 * 1. OPENAI_API_KEY from runtime env files / process env
 * 2. ai_provider_connections.configuration.apiKey (sync into embedding connection)
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { loadRuntimeEnv, resolveOpenAiApiKey } from "./lib/runtime-env.mjs";

const root = resolve("C:/Users/oabde/Downloads/project");
const env = loadRuntimeEnv(root);

function resolveServiceRoleKey() {
  if (env.SUPABASE_SERVICE_ROLE_KEY) return env.SUPABASE_SERVICE_ROLE_KEY;
  const out = execSync("supabase projects api-keys --project-ref lfbtnskmvibikalsxwsm -o json", {
    encoding: "utf8",
    cwd: root,
  });
  return JSON.parse(out).find((entry: { name: string }) => entry.name === "service_role")?.api_key as string;
}

function keyPresent(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceRoleKey = resolveServiceRoleKey();
if (!url || !serviceRoleKey) {
  console.error("FAIL wire: Supabase credentials unavailable.");
  process.exit(1);
}

const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const { data: company } = await client.from("companies").select("id").eq("company_type", "tenant").limit(1).single();
const companyId = company!.id as string;

const envKey = resolveOpenAiApiKey();
let resolvedKey = envKey;
let source = envKey ? "OPENAI_API_KEY" : "";

if (!resolvedKey) {
  const { data: aiConnections } = await client
    .from("ai_provider_connections")
    .select("configuration, ai_provider_definitions(key)")
    .eq("company_id", companyId)
    .eq("is_enabled", true)
    .is("deleted_at", null);
  const aiKey = aiConnections
    ?.map((conn) => (conn.configuration as { apiKey?: string })?.apiKey)
    .find((value) => keyPresent(value));
  if (aiKey) {
    resolvedKey = aiKey.trim();
    source = "ai_provider_connections.configuration.apiKey";
  }
}

const { data: embeddingConnections } = await client
  .from("embedding_provider_connections")
  .select("id, is_default, is_enabled, status, configuration, embedding_provider_definitions(key)")
  .eq("company_id", companyId)
  .is("deleted_at", null);

const target =
  embeddingConnections?.find(
    (conn) => conn.is_enabled && conn.is_default && conn.embedding_provider_definitions?.key === "openai",
  ) ??
  embeddingConnections?.find((conn) => conn.is_enabled && conn.embedding_provider_definitions?.key === "openai") ??
  embeddingConnections?.find((conn) => conn.embedding_provider_definitions?.key === "openai");

if (!target?.id) {
  console.error("FAIL wire: No OpenAI embedding connection found for tenant.");
  process.exit(1);
}

const currentConfig = (target.configuration ?? {}) as Record<string, unknown>;
const currentKey = currentConfig.apiKey;
const hasConnectionKey = keyPresent(currentKey);

if (!resolvedKey && !hasConnectionKey) {
  console.log(
    JSON.stringify(
      {
        status: "blocked",
        reason: "No OpenAI API key in OPENAI_API_KEY, env files, ai_provider_connections, or embedding connection.",
        placement: [
          "Set OPENAI_API_KEY in .env or artifacts/login-app/.env.local",
          "Or store configuration.apiKey on the tenant embedding_provider_connections row",
        ],
        embeddingConnectionId: target.id,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

if (resolvedKey && !hasConnectionKey) {
  const nextConfiguration = {
    ...currentConfig,
    apiKey: resolvedKey,
    model: currentConfig.model ?? "text-embedding-3-small",
    dimensions: currentConfig.dimensions ?? 1536,
  };
  const { error } = await client
    .from("embedding_provider_connections")
    .update({
      configuration: nextConfiguration,
      is_enabled: true,
      status: "active",
      health_status: "connected",
    })
    .eq("id", target.id);
  if (error) {
    console.error(`FAIL wire: Could not update embedding connection — ${error.message}`);
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      {
        status: "synced",
        source,
        embeddingConnectionId: target.id,
        action: "configuration.apiKey written to embedding_provider_connections",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log(
  JSON.stringify(
    {
      status: "ready",
      source: hasConnectionKey ? "embedding_provider_connections.configuration.apiKey" : source,
      embeddingConnectionId: target.id,
      action: "no changes required",
    },
    null,
    2,
  ),
);
