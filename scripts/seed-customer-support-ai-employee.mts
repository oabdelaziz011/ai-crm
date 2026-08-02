/**
 * Seed Customer Support AI into a target tenant via application services (no manual SQL).
 *
 * Usage:
 *   TARGET_EMAIL=oabdelaziz011@gmail.com \
 *   TARGET_COMPANY_ID=2d27f7fb-c15e-4d60-84e9-1793f36f2172 \
 *   npx tsx --tsconfig artifacts/login-app/tsconfig.json scripts/seed-customer-support-ai-employee.mts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const TARGET_EMAIL = process.env.TARGET_EMAIL ?? "oabdelaziz011@gmail.com";
const TARGET_COMPANY_ID =
  process.env.TARGET_COMPANY_ID ?? "2d27f7fb-c15e-4d60-84e9-1793f36f2172";

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
process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || "";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || "";

const { createAiEmployeeServices } = await import("../artifacts/login-app/src/lib/ai-employees/index.ts");
const { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } = await import(
  "../artifacts/login-app/src/lib/ai-employees/adapters/ai-employee-runtime-types.ts"
);
const { resolveProviderCapabilities } = await import(
  "../artifacts/login-app/src/lib/ai-employees/adapters/model-capabilities-catalog.ts"
);
import type { AiEmployeeFormValues, AiEmployeeRecord } from "../artifacts/login-app/src/lib/ai-employees/types/ai-employee-types.ts";
import type { TenantRuntimeContext } from "../artifacts/login-app/src/lib/ai-employees/services/ai-employee-configuration-service.ts";

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

const SUPPORT_TAGS = [
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
    tags: SUPPORT_TAGS,
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

async function resolveActorId(admin: SupabaseClient, companyId: string): Promise<string | null> {
  const { data: byEmail, error: emailError } = await admin
    .from("profiles")
    .select("id, company_id, email")
    .eq("email", TARGET_EMAIL)
    .maybeSingle();

  if (emailError) throw new Error(emailError.message);
  if (byEmail?.id) {
    if (byEmail.company_id !== companyId) {
      throw new Error(
        `Profile for ${TARGET_EMAIL} belongs to company ${byEmail.company_id}, expected ${companyId}`,
      );
    }
    return byEmail.id as string;
  }

  const { data: authUsers, error: authError } = await admin.auth.admin.listUsers();
  if (authError) throw new Error(authError.message);
  const authUser = authUsers.users.find((user) => user.email?.toLowerCase() === TARGET_EMAIL.toLowerCase());
  if (!authUser) throw new Error(`No auth user found for ${TARGET_EMAIL}`);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, company_id")
    .eq("id", authUser.id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile?.id) throw new Error(`No profile for ${TARGET_EMAIL}`);
  if (profile.company_id !== companyId) {
    throw new Error(`User company ${profile.company_id} does not match target ${companyId}`);
  }
  return profile.id as string;
}

async function verifyRestRow(client: SupabaseClient, companyId: string, employeeId: string) {
  const restUrl = `${supabaseUrl}/rest/v1/ai_employees?select=id,name,display_name,status,company_id&company_id=eq.${companyId}&deleted_at=is.null&order=updated_at.desc`;
  const session = (await client.auth.getSession()).data.session;
  const headers: Record<string, string> = {
    apikey: anonKey,
    Accept: "application/json",
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  } else if (serviceKey) {
    headers.Authorization = `Bearer ${serviceKey}`;
  }

  const res = await fetch(restUrl, { headers });
  const body = await res.json();
  const rows = Array.isArray(body) ? body : [];
  const match = rows.find((row: { id: string }) => row.id === employeeId);

  return {
    restUrl,
    status: res.status,
    rowCount: rows.length,
    rows,
    match,
  };
}

async function main() {
  if (!supabaseUrl || !anonKey) {
    console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
    process.exit(2);
  }
  if (!serviceKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY (required to resolve actor and seed via services)");
    process.exit(2);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const companyId = TARGET_COMPANY_ID;

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id, name, status")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) throw new Error(companyError.message);
  if (!company) {
    console.error("TARGET_COMPANY_NOT_FOUND", companyId);
    process.exit(1);
  }

  const actorId = await resolveActorId(admin, companyId);
  const services = createAiEmployeeServices(admin);

  console.log("TARGET", JSON.stringify({ email: TARGET_EMAIL, companyId, companyName: company.name, actorId }));

  const [toolOptions, skillRows, providerConnectionQuery] = await Promise.all([
    services.registry.listToolOptions(),
    admin
      .from("ai_skills")
      .select("id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .in("status", ["published", "draft"])
      .limit(5),
    admin
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
    console.error("No enabled AI provider connection for target company", companyId);
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

  const tenantRuntime = await resolveTenantRuntime(admin, companyId, providerKey);
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
        publishNotes: "Seed — Customer Support AI for omnichannel support",
        actorId,
      },
      preview,
    );
  }

  employee = (await services.registry.getById(employee.id, companyId))!;

  const verification = await verifyRestRow(admin, companyId, employee.id);

  console.log(
    "RESULT",
    JSON.stringify(
      {
        employeeId: employee.id,
        name: employee.name,
        displayName: employee.displayName,
        status: employee.status,
        companyId: employee.companyId ?? companyId,
        publishedVersionId: employee.publishedVersionId,
        restVerification: {
          url: verification.restUrl,
          httpStatus: verification.status,
          rowCount: verification.rowCount,
          matchedEmployee: verification.match ?? null,
        },
      },
      null,
      2,
    ),
  );

  if (verification.status !== 200 || verification.rowCount < 1 || !verification.match) {
    console.error("VERIFY_FAIL", verification);
    process.exit(1);
  }

  console.log("DONE");
}

main().catch((error) => {
  console.error("SEED_FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
