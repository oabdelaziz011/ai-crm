/**
 * Sprint A1-05 production prerequisite checks.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { loadRuntimeEnv } from "./lib/runtime-env.mjs";

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

type Check = { id: string; ok: boolean; detail: string };
const checks: Check[] = [];

function record(id: string, ok: boolean, detail: string) {
  checks.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id}: ${detail}`);
}

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceRoleKey = resolveServiceRoleKey();
if (!url || !serviceRoleKey) {
  record("supabase_credentials", false, "Missing Supabase URL or service role key.");
  process.exit(1);
}
record("supabase_credentials", true, "Supabase URL and service role key resolved.");

const openaiEnv = (process.env.OPENAI_API_KEY ?? env.OPENAI_API_KEY ?? "").trim();
record(
  "openai_api_key_env",
  Boolean(openaiEnv),
  openaiEnv ? `OPENAI_API_KEY present (length ${openaiEnv.length})` : "OPENAI_API_KEY not set in process env or env files",
);

const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const { data: company, error: companyError } = await client
  .from("companies")
  .select("id, name")
  .eq("company_type", "tenant")
  .limit(1)
  .maybeSingle();
if (companyError || !company?.id) {
  record("tenant_company", false, companyError?.message ?? "No tenant company found.");
  process.exit(1);
}
record("tenant_company", true, `${company.name} (${company.id})`);
const companyId = company.id as string;

const { data: aiConns } = await client
  .from("ai_provider_connections")
  .select("configuration, ai_provider_definitions(key)")
  .eq("company_id", companyId)
  .eq("is_enabled", true)
  .is("deleted_at", null);
const aiCfgKey =
  aiConns
    ?.map((conn) => (conn.configuration as { apiKey?: string })?.apiKey)
    .find((value) => typeof value === "string" && value.trim())?.trim() ?? "";
record(
  "openai_chat_connection_key",
  Boolean(aiCfgKey),
  aiCfgKey ? "apiKey present on ai_provider_connections (can be synced via a105-wire-embedding-api-key.mts)" : "No apiKey on enabled ai_provider_connections",
);

const { data: embConns } = await client
  .from("embedding_provider_connections")
  .select("id, display_name, is_enabled, is_default, status, configuration, embedding_provider_definitions(key)")
  .eq("company_id", companyId)
  .is("deleted_at", null);
const enabledEmb = (embConns ?? []).filter((conn) => conn.is_enabled && conn.status === "active");
const openaiConn =
  enabledEmb.find((conn) => conn.embedding_provider_definitions?.key === "openai") ?? enabledEmb[0];
const cfg = (openaiConn?.configuration ?? {}) as { apiKey?: string; model?: string };
const cfgKey = typeof cfg.apiKey === "string" && cfg.apiKey.trim() ? cfg.apiKey.trim() : "";
record(
  "openai_embedding_connection",
  enabledEmb.length > 0,
  enabledEmb.length
    ? `enabled=${enabledEmb.length}, default=${enabledEmb.filter((conn) => conn.is_default).length}, provider=${openaiConn?.embedding_provider_definitions?.key ?? "unknown"}`
    : "No enabled active embedding connections for tenant",
);
record(
  "openai_api_key_resolvable",
  Boolean(openaiEnv || cfgKey || aiCfgKey),
  cfgKey
    ? "apiKey stored in embedding connection configuration"
    : aiCfgKey
      ? "apiKey available on ai_provider_connections — run a105-wire-embedding-api-key.mts"
    : openaiEnv
      ? "Resolved from OPENAI_API_KEY environment variable"
      : "Missing OPENAI_API_KEY and configuration.apiKey on all provider connections",
);

const [
  { count: aiSettings },
  { count: vecConns },
  { count: collections },
  { count: retrievalPolicies },
] = await Promise.all([
  client.from("ai_assistant_settings").select("id", { count: "exact", head: true }).eq("company_id", companyId),
  client
    .from("vector_store_connections")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("is_enabled", true)
    .is("deleted_at", null),
  client
    .from("vector_collections")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("name", "knowledge_default")
    .is("deleted_at", null),
  client
    .from("retrieval_policies")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("is_default", true),
]);
const bootstrapOk =
  (aiSettings ?? 0) > 0 &&
  (embConns?.length ?? 0) > 0 &&
  (vecConns ?? 0) > 0 &&
  (collections ?? 0) > 0 &&
  (retrievalPolicies ?? 0) > 0;
record(
  "tenant_ai_bootstrap",
  bootstrapOk,
  JSON.stringify({
    aiAssistantSettings: aiSettings ?? 0,
    embeddingConnections: embConns?.length ?? 0,
    vectorConnections: vecConns ?? 0,
    knowledgeDefaultCollection: collections ?? 0,
    defaultRetrievalPolicy: retrievalPolicies ?? 0,
  }),
);

const { data: pgvectorDef } = await client.from("vector_store_definitions").select("id").eq("key", "pgvector").maybeSingle();
const { count: pgvectorConns } = await client
  .from("vector_store_connections")
  .select("id", { count: "exact", head: true })
  .eq("company_id", companyId)
  .eq("provider_id", pgvectorDef?.id ?? "missing")
  .eq("is_enabled", true)
  .is("deleted_at", null);
const { data: pgvectorConn } = await client
  .from("vector_store_connections")
  .select("health_status, last_health_check")
  .eq("company_id", companyId)
  .eq("provider_id", pgvectorDef?.id ?? "missing")
  .eq("is_enabled", true)
  .is("deleted_at", null)
  .maybeSingle();
record(
  "pgvector_connection",
  (pgvectorConns ?? 0) > 0 && pgvectorConn?.health_status === "connected",
  `pgvector enabled connections=${pgvectorConns ?? 0}, health=${pgvectorConn?.health_status ?? "unknown"}`,
);

const pgProbe = await client.from("pgvector_store_collections").select("id").limit(1);
record(
  "pgvector_migration",
  !pgProbe.error,
  pgProbe.error?.message ?? "pgvector_store_collections reachable",
);

if (openaiEnv || cfgKey || aiCfgKey) {
  try {
    const { createOpenAIEmbeddingAdapter } = await import("../lib/embedding-platform/src/providers/openai-embedding-adapter.ts");
    const adapter = createOpenAIEmbeddingAdapter({
      apiKey: cfgKey || openaiEnv || aiCfgKey,
      model: cfg.model ?? "text-embedding-3-small",
      dimensions: 1536,
    });
    const result = await adapter.embed({ texts: ["A1-05 prerequisite probe"] });
    record(
      "worker_provider_access",
      Array.isArray(result.embeddings) && result.embeddings[0]?.length === 1536,
      `OpenAI embedding probe returned ${result.embeddings[0]?.length ?? 0} dimensions`,
    );
  } catch (error) {
    record("worker_provider_access", false, error instanceof Error ? error.message : String(error));
  }
} else {
  record("worker_provider_access", false, "Skipped — no OpenAI API key available");
}

const passed = checks.filter((check) => check.ok).length;
console.log(`\nPREREQUISITES: ${passed}/${checks.length} PASS`);
if (passed < checks.length) process.exit(1);
