/**
 * Sprint A1-05.1 validation: WhatsApp runtime bootstrap integration.
 * Run: tsx scripts/a1051-whatsapp-runtime-bootstrap.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeEnv } from "./lib/runtime-env.mjs";
import { createTenantRuntimeConfigService } from "../lib/tenant-ai-bootstrap/src/services/tenant-runtime-config-service.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = loadRuntimeEnv(root);

const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;

if (!url || !serviceRoleKey) {
  console.log(JSON.stringify({ verdict: "FAIL", reason: "missing_supabase_service_role_credentials" }, null, 2));
  process.exit(1);
}

const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const runtimeConfigService = createTenantRuntimeConfigService(client);

const { data: company } = await client
  .from("companies")
  .select("id, name, company_type")
  .eq("company_type", "tenant")
  .limit(1)
  .maybeSingle();

if (!company?.id) {
  console.log(JSON.stringify({ verdict: "FAIL", reason: "no_tenant_company" }, null, 2));
  process.exit(1);
}

const companyId = company.id as string;
const config = await runtimeConfigService.ensureReady(companyId);

const newTenantScenario = {
  aiAssistantId: Boolean(config.aiAssistantId),
  providerConnectionId: Boolean(config.providerConnectionId),
  knowledgeRetrieval: config.knowledgeRetrieval,
  ready: config.ready,
  missing: config.missing,
};

const returningUserScenario = {
  runtimeResolvable: config.ready,
  providerConnectionId: config.providerConnectionId || null,
};

const verdict =
  newTenantScenario.ready &&
  newTenantScenario.aiAssistantId &&
  newTenantScenario.providerConnectionId &&
  returningUserScenario.runtimeResolvable
    ? "READY FOR A1-06"
    : "FIX REQUIRED";

console.log(
  JSON.stringify(
    {
      verdict,
      company: { id: companyId, name: company.name },
      newTenantScenario,
      returningUserScenario,
    },
    null,
    2,
  ),
);

process.exit(verdict === "READY FOR A1-06" ? 0 : 1);
