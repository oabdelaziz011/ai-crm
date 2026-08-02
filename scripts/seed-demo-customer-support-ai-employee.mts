/**
 * Seed one demo AI Employee through application repositories/services (no manual SQL).
 * Run: cd artifacts/login-app && npx tsx --tsconfig tsconfig.json ../../scripts/seed-demo-customer-support-ai-employee.mts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const env: Record<string, string> = {};
  for (const p of [resolve(root, "artifacts/login-app/.env.local"), resolve(root, ".env")]) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

const env = loadEnv();
process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const { createAiEmployeeServices } = await import("../artifacts/login-app/src/lib/ai-employees/index.ts");
const { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } = await import(
  "../artifacts/login-app/src/lib/ai-employees/adapters/ai-employee-runtime-types.ts"
);
const { resolveProviderCapabilities } = await import(
  "../artifacts/login-app/src/lib/ai-employees/adapters/model-capabilities-catalog.ts"
);
import type { AiEmployeeFormValues, AiEmployeeRecord } from "../artifacts/login-app/src/lib/ai-employees/types/ai-employee-types.ts";
import type { TenantRuntimeContext } from "../artifacts/login-app/src/lib/ai-employees/services/ai-employee-configuration-service.ts";

const DEMO_EMAIL = "demo-beta-admin@vaultos.local";
const DEMO_PASSWORD = "DemoVault2026!";
const EMPLOYEE_NAME = "Customer Support AI";

const DEFAULT_SYSTEM_PROMPT = `You are Customer Support AI (موظف خدمة العملاء), an enterprise AI employee for customer support on Vault OS.

Core responsibilities:
- Handle omnichannel customer conversations professionally in Arabic and English
- Match the customer's language (Arabic or English) naturally in every reply
- Retrieve and apply knowledge base content when answering product and policy questions
- Offer concise suggested replies and conversation summaries for human agents when helpful
- Hand over to a human agent when the customer requests it or when confidence is low
- Escalate urgent, sensitive, or unresolved issues through the escalation path
- Create follow-up tickets when a case requires tracking beyond the current session

Behavior:
- Be empathetic, accurate, and action-oriented
- Confirm understanding before taking irreversible actions
- Never invent policies, prices, or account details
- Ask clarifying questions when intent is ambiguous`;

const DEMO_TAGS = [
  "موظف خدمة العملاء",
  "language:ar",
  "language:en",
  "capability:ai-runtime",
  "capability:omnichannel",
  "capability:knowledge",
  "capability:suggested-replies",
  "capability:conversation-summary",
  "capability:handover-human",
  "capability:escalation",
  "capability:ticket-creation",
];

async function resolveTenantRuntime(
  client: SupabaseClient,
  companyId: string,
  providerKey: string | null,
): Promise<TenantRuntimeContext> {
  const { data: connections, error } = await client
    .from("ai_provider_connections")
    .select("id, display_name, ai_provider_definitions(key)")
    .eq("company_id", companyId)
    .eq("is_enabled", true)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  type ConnectionRow = {
    id: string;
    display_name: string;
    ai_provider_definitions: { key: string } | { key: string }[] | null;
  };

  const rows = (connections ?? []) as ConnectionRow[];
  const matched =
    rows.find((row) => {
      const def = Array.isArray(row.ai_provider_definitions)
        ? row.ai_provider_definitions[0]
        : row.ai_provider_definitions;
      return providerKey != null && def?.key === providerKey;
    }) ?? rows[0] ?? null;

  const def = matched
    ? Array.isArray(matched.ai_provider_definitions)
      ? matched.ai_provider_definitions[0]
      : matched.ai_provider_definitions
    : null;

  return {
    companyId,
    config: {
      providerConnectionId: matched?.id ?? null,
      knowledgeRetrieval: null,
      ready: Boolean(matched),
      missing: matched ? [] : (["provider"] as const),
    },
    providerConnectionName: matched?.display_name ?? null,
    providerRegistryKey: def?.key ?? null,
    collectionName: null,
    availableModels: resolveProviderCapabilities(providerKey).models,
  };
}

function pickToolKeys(tools: Array<{ key: string }>): string[] {
  const preferred = [
    "knowledge_lookup",
    "knowledge_search",
    "faq",
    "crm_lookup",
    "search_customer",
    "escalation",
    "notification",
    "create_customer",
  ];
  const keys = new Set<string>();
  for (const key of preferred) {
    if (tools.some((tool) => tool.key === key)) keys.add(key);
  }
  if (keys.size === 0 && tools[0]) keys.add(tools[0].key);
  return [...keys];
}

function buildFormValues(input: {
  providerKey: string;
  model: string;
  allowedToolKeys: string[];
  skillIds: string[];
  actorId: string | null;
  status: AiEmployeeFormValues["status"];
}): AiEmployeeFormValues {
  return {
    name: EMPLOYEE_NAME,
    displayName: EMPLOYEE_NAME,
    description: "Enterprise AI employee that handles customer support conversations.",
    avatar: null,
    department: "Customer Support",
    ownerId: input.actorId,
    status: input.status,
    provider: input.providerKey,
    model: input.model,
    temperature: 0.4,
    maxTokens: 4096,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    knowledgeSourceIds: [],
    allowedToolKeys: input.allowedToolKeys,
    allowedSkillIds: input.skillIds,
    tags: DEMO_TAGS,
  };
}

async function applyConfiguration(
  services: ReturnType<typeof createAiEmployeeServices>,
  employee: AiEmployeeRecord,
  companyId: string,
  actorId: string | null,
  providerKey: string,
  model: string,
  allowedToolKeys: string[],
  skillIds: string[],
) {
  return services.configuration.updateConfiguration(
    employee.id,
    companyId,
    {
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      provider: providerKey,
      model,
      temperature: 0.4,
      maxTokens: 4096,
      knowledgeSourceIds: [],
      allowedToolKeys,
      allowedSkillIds: skillIds,
      promptVersionLabel: "v1",
      runtimeConfiguration: {
        ...DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
        runtimeFlags: {
          ...DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION.runtimeFlags,
          streaming: true,
          memoryMode: "session",
          recoveryEnabled: true,
          checkpointEnabled: true,
        },
      },
    },
    actorId,
  );
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(2);
  }

  const client = createClient(url, key);
  const { data: auth, error: authError } = await client.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (authError) {
    console.error("AUTH_FAIL", authError.message);
    process.exit(1);
  }

  const actorId = auth.user?.id ?? null;
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("company_id")
    .eq("id", actorId!)
    .single();
  if (profileError || !profile?.company_id) {
    console.error("PROFILE_FAIL", profileError?.message ?? "missing company");
    process.exit(1);
  }

  const companyId = profile.company_id as string;
  const services = createAiEmployeeServices(client);

  const [toolOptions, skillRows, providerConnectionQuery] = await Promise.all([
    services.registry.listToolOptions(),
    client
      .from("ai_skills")
      .select("id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .in("status", ["published", "draft"])
      .limit(5),
    client
      .from("ai_provider_connections")
      .select("id, display_name, ai_provider_definitions(key)")
      .eq("company_id", companyId)
      .eq("is_enabled", true)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle(),
  ]);

  if (skillRows.error) throw new Error(skillRows.error.message);
  if (providerConnectionQuery.error) throw new Error(providerConnectionQuery.error.message);

  const skillIds = ((skillRows.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  const providerDef = providerConnectionQuery.data?.ai_provider_definitions as
    | { key: string }
    | { key: string }[]
    | null
    | undefined;
  const providerKey = Array.isArray(providerDef) ? providerDef[0]?.key : providerDef?.key;
  if (!providerKey) {
    console.error("No enabled AI provider connection for demo company");
    process.exit(1);
  }

  const model = resolveProviderCapabilities(providerKey).models[0] ?? "gpt-4.1-mini";
  const allowedToolKeys = pickToolKeys(toolOptions);

  const existing = await services.registry.list(companyId, { search: "customer support" });
  let employee = existing.find((row) => row.name === "customer-support-ai") ?? null;

  if (employee) {
    console.log("Resuming existing employee…", employee.id);
    employee = await services.registry.update(
      employee.id,
      companyId,
      buildFormValues({
        providerKey,
        model,
        allowedToolKeys,
        skillIds,
        actorId,
        status: employee.status,
      }),
      actorId,
    );
  } else {
    console.log("Creating AI employee…");
    employee = await services.registry.create(
      companyId,
      buildFormValues({ providerKey, model, allowedToolKeys, skillIds, actorId, status: "draft" }),
      actorId,
    );
  }

  console.log("Updating runtime configuration…");
  employee = await applyConfiguration(
    services,
    employee,
    companyId,
    actorId,
    providerKey,
    model,
    allowedToolKeys,
    skillIds,
  );

  const tenantRuntime = await resolveTenantRuntime(client, companyId, providerKey);
  const preview = await services.configuration.buildRuntimePreview(employee, tenantRuntime);

  console.log("Publishing…", {
    ready: preview.ready,
    missing: preview.missing,
    issueCount: preview.validationIssues.length,
  });

  if (!preview.ready) {
    console.error("PREVIEW_NOT_READY", JSON.stringify({ missing: preview.missing, issues: preview.validationIssues }));
    process.exit(1);
  }

  if (employee.status !== "published") {
    await services.lifecycle.publish(
      {
        employeeId: employee.id,
        companyId,
        publishNotes: "Demo seed — Customer Support AI for omnichannel support",
        actorId,
      },
      preview,
    );
  }

  employee = (await services.registry.getById(employee.id, companyId))!;

  console.log("VERIFY_CREATE", JSON.stringify({
    id: employee.id,
    name: employee.name,
    displayName: employee.displayName,
    status: employee.status,
    department: employee.department,
    publishedVersionId: employee.publishedVersionId,
    toolCount: employee.allowedToolKeys.length,
    skillCount: employee.allowedSkillIds.length,
  }));

  employee = await services.registry.update(
    employee.id,
    companyId,
    {
      ...buildFormValues({
        providerKey,
        model,
        allowedToolKeys,
        skillIds,
        actorId,
        status: employee.status,
      }),
      description: "Enterprise AI employee that handles customer support conversations. (updated via registry service)",
    },
    actorId,
  );
  console.log("VERIFY_UPDATE", employee.description);

  const republishPreview = await services.configuration.buildRuntimePreview(employee, tenantRuntime);
  if (republishPreview.ready) {
    await services.lifecycle.publish(
      {
        employeeId: employee.id,
        companyId,
        publishNotes: "Republish after edit verification",
        actorId,
      },
      republishPreview,
    );
    console.log("VERIFY_REPUBLISH", "ok");
  }

  await services.registry.softDelete(employee.id, companyId, actorId);
  const afterDelete = await services.registry.getById(employee.id, companyId);
  console.log("VERIFY_DELETE", afterDelete === null ? "soft-deleted" : "still-visible");

  await services.repositories.employees.restoreArchived(employee.id, companyId, actorId);
  const restored = (await services.registry.getById(employee.id, companyId))!;
  restored.knowledgeSourceIds = [];
  const finalPreview = await services.configuration.buildRuntimePreview(restored, tenantRuntime);
  if (finalPreview.ready) {
    await services.lifecycle.publish(
      {
        employeeId: employee.id,
        companyId,
        publishNotes: "Restore demo employee to published state",
        actorId,
      },
      finalPreview,
    );
  }

  const finalEmployee = await services.registry.getById(employee.id, companyId);
  console.log("VERIFY_RESTORE", finalEmployee?.status ?? "missing");

  console.log("DONE", JSON.stringify({
    employeeId: employee.id,
    dashboardPath: `/dashboard/agents/${employee.id}`,
  }));
}

main().catch((error) => {
  console.error("SEED_FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
