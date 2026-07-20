/**
 * Sprint A1-02 acceptance validation: tenant AI bootstrap scenarios.
 * Run: tsx scripts/tenant-ai-bootstrap-validation.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve("C:/Users/oabde/Downloads/project");
const DEFAULT_COLLECTION_NAME = "knowledge_default";
const TENANT_PROMPT_TEMPLATE_KEYS = {
  conversationEn: "tenant_conversation_en",
  conversationAr: "tenant_conversation_ar",
};

function loadEnv() {
  const env: Record<string, string> = {};
  for (const filePath of [resolve(root, "artifacts/login-app/.env.local"), resolve(root, ".env")]) {
    try {
      for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match) env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

function resolveServiceRoleKey(env: Record<string, string>) {
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

async function verifyBootstrap(client: ReturnType<typeof createClient>, companyId: string) {
  const [
    settings,
    aiConnections,
    embeddingConnections,
    vectorConnections,
    collections,
    retrievalPolicies,
    executionPolicies,
    searchPolicies,
    promptTemplates,
  ] = await Promise.all([
    client.from("ai_assistant_settings").select("id").eq("company_id", companyId).maybeSingle(),
    client
      .from("ai_provider_connections")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    client
      .from("embedding_provider_connections")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    client
      .from("vector_store_connections")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    client
      .from("vector_collections")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("name", DEFAULT_COLLECTION_NAME)
      .is("deleted_at", null),
    client
      .from("retrieval_policies")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_default", true),
    client
      .from("execution_policies")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_default", true),
    client
      .from("vector_search_policies")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_default", true),
    client
      .from("prompt_templates")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("key", [TENANT_PROMPT_TEMPLATE_KEYS.conversationEn, TENANT_PROMPT_TEMPLATE_KEYS.conversationAr]),
  ]);

  return {
    hasAssistantSettings: Boolean(settings.data?.id),
    aiProviderConnectionCount: aiConnections.count ?? 0,
    embeddingConnectionCount: embeddingConnections.count ?? 0,
    vectorStoreConnectionCount: vectorConnections.count ?? 0,
    defaultCollectionCount: collections.count ?? 0,
    retrievalPolicyCount: retrievalPolicies.count ?? 0,
    executionPolicyCount: (executionPolicies.count ?? 0) > 0,
    vectorSearchPolicyCount: (searchPolicies.count ?? 0) > 0,
    promptTemplateCount: promptTemplates.count ?? 0,
  };
}

function assertBootstrapComplete(verification: Awaited<ReturnType<typeof verifyBootstrap>>) {
  return (
    verification.hasAssistantSettings &&
    verification.aiProviderConnectionCount >= 1 &&
    verification.embeddingConnectionCount >= 1 &&
    verification.vectorStoreConnectionCount >= 1 &&
    verification.defaultCollectionCount >= 1 &&
    verification.retrievalPolicyCount >= 1 &&
    verification.executionPolicyCount &&
    verification.vectorSearchPolicyCount &&
    verification.promptTemplateCount >= 2
  );
}

async function countRows(
  client: ReturnType<typeof createClient>,
  table: string,
  companyId: string,
  extra?: (query: any) => any,
) {
  let query = client.from(table).select("id", { count: "exact", head: true }).eq("company_id", companyId);
  if (extra) query = extra(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function createTenant(client: ReturnType<typeof createClient>, name: string) {
  const { data: company, error: insertError } = await client
    .from("companies")
    .insert({
      name,
      status: "Trial",
      company_type: "tenant",
      tenant_provisioning_status: "pending",
    })
    .select("id, name")
    .single();

  if (insertError) throw insertError;

  const { data: provisioned, error: provisionError } = await client.rpc("execute_tenant_provisioning", {
    p_company_id: company.id,
  });
  if (provisionError) throw provisionError;

  return { companyId: company.id as string, provisioned };
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = resolveServiceRoleKey(env);
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase URL and service role key are required.");
  }

  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const { companyId, provisioned } = await createTenant(client, `A1-02 Bootstrap ${Date.now()}`);
  record(
    "scenario1.create_company",
    Boolean(companyId) && provisioned?.status === "completed",
    `${companyId} provisioning=${JSON.stringify(provisioned)}`,
  );

  const verification1 = await verifyBootstrap(client, companyId);
  record(
    "scenario1.ai_configuration",
    assertBootstrapComplete(verification1),
    JSON.stringify(verification1),
  );

  const counts1 = {
    settings: await countRows(client, "ai_assistant_settings", companyId),
    aiConnections: await countRows(client, "ai_provider_connections", companyId, (q) => q.is("deleted_at", null)),
    embeddingConnections: await countRows(client, "embedding_provider_connections", companyId, (q) =>
      q.is("deleted_at", null),
    ),
    vectorConnections: await countRows(client, "vector_store_connections", companyId, (q) => q.is("deleted_at", null)),
    collections: await countRows(client, "vector_collections", companyId, (q) =>
      q.eq("name", DEFAULT_COLLECTION_NAME).is("deleted_at", null),
    ),
    retrievalPolicies: await countRows(client, "retrieval_policies", companyId, (q) => q.eq("is_default", true)),
    promptTemplates: await countRows(client, "prompt_templates", companyId, (q) =>
      q.in("key", [TENANT_PROMPT_TEMPLATE_KEYS.conversationEn, TENANT_PROMPT_TEMPLATE_KEYS.conversationAr]),
    ),
  };

  const { data: bootstrap2, error: bootstrap2Error } = await client.rpc("provision_tenant_ai_bootstrap", {
    p_company_id: companyId,
  });
  if (bootstrap2Error) throw bootstrap2Error;

  const steps = Array.isArray(bootstrap2?.steps) ? bootstrap2.steps : [];
  record(
    "scenario2.idempotent_bootstrap",
    steps.every((step: { created?: boolean }) => step.created !== true),
    JSON.stringify({ skipped: bootstrap2?.skipped, createdSteps: steps.filter((s: { created?: boolean }) => s.created).length }),
  );

  const counts2 = {
    settings: await countRows(client, "ai_assistant_settings", companyId),
    aiConnections: await countRows(client, "ai_provider_connections", companyId, (q) => q.is("deleted_at", null)),
    embeddingConnections: await countRows(client, "embedding_provider_connections", companyId, (q) =>
      q.is("deleted_at", null),
    ),
    vectorConnections: await countRows(client, "vector_store_connections", companyId, (q) => q.is("deleted_at", null)),
    collections: await countRows(client, "vector_collections", companyId, (q) =>
      q.eq("name", DEFAULT_COLLECTION_NAME).is("deleted_at", null),
    ),
    retrievalPolicies: await countRows(client, "retrieval_policies", companyId, (q) => q.eq("is_default", true)),
    promptTemplates: await countRows(client, "prompt_templates", companyId, (q) =>
      q.in("key", [TENANT_PROMPT_TEMPLATE_KEYS.conversationEn, TENANT_PROMPT_TEMPLATE_KEYS.conversationAr]),
    ),
  };

  record(
    "scenario2.no_duplicates",
    JSON.stringify(counts1) === JSON.stringify(counts2),
    `before=${JSON.stringify(counts1)} after=${JSON.stringify(counts2)}`,
  );

  const { companyId: customCompanyId } = await createTenant(client, `A1-02 Custom ${Date.now()}`);

  const customAssistantName = `Custom Assistant ${Date.now()}`;
  await client
    .from("ai_assistant_settings")
    .update({
      assistant_name: customAssistantName,
      model: "gpt-custom-model",
      knowledge_enabled: false,
    })
    .eq("company_id", customCompanyId);

  const { error: customBootstrapError } = await client.rpc("provision_tenant_ai_bootstrap", {
    p_company_id: customCompanyId,
  });
  if (customBootstrapError) throw customBootstrapError;

  const { data: settingsAfter } = await client
    .from("ai_assistant_settings")
    .select("assistant_name, model, knowledge_enabled")
    .eq("company_id", customCompanyId)
    .single();

  record(
    "scenario3.custom_settings_preserved",
    settingsAfter?.assistant_name === customAssistantName &&
      settingsAfter?.model === "gpt-custom-model" &&
      settingsAfter?.knowledge_enabled === false,
    JSON.stringify(settingsAfter),
  );

  const passed = checks.filter((check) => check.ok).length;
  console.log(`\nSUMMARY: ${passed}/${checks.length} PASS`);
  if (passed < checks.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
