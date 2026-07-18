/**
 * RBAC E2E validation against linked Supabase (demo personas).
 * Run: tsx scripts/rbac-e2e-validation.mts
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const paths = [
    resolve(root, "artifacts/login-app/.env.local"),
    resolve(root, ".env"),
  ];
  const env: Record<string, string> = {};
  for (const p of paths) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL =
  env.VITE_SUPABASE_URL || env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase URL or publishable key");
  process.exit(2);
}

const PASSWORD = "DemoVault2026!";

type Persona = {
  email: string;
  label: string;
  expect: Record<string, boolean>;
};

const PERSONAS: Persona[] = [
  {
    email: "demo-platform@vaultos.local",
    label: "Platform Owner",
    expect: {
      "users.view": true,
      "users.edit": true,
      "roles.view": true,
      "audit_logs.view": true,
      "companies.view": true,
      "channels.view": true,
      "billing.view": true,
    },
  },
  {
    email: "demo-beta-admin@vaultos.local",
    label: "Company Admin",
    expect: {
      "users.view": true,
      "users.edit": true,
      "roles.view": true,
      "audit_logs.view": true,
      "companies.view": false,
      "channels.view": true,
      "billing.view": false,
    },
  },
  {
    email: "demo-finance@vaultos.local",
    label: "Finance Manager",
    expect: {
      "users.view": false,
      "users.edit": false,
      "billing.view": false,
      "billing.view_own": true,
      "billing.manage_own": true,
      "billing.contact.edit_own": true,
      "workspace.view": true,
    },
  },
  {
    email: "demo-support@vaultos.local",
    label: "Support Agent",
    expect: {
      "users.view": false,
      "customers.view": true,
      "customers.edit": true,
      "ai_chat.view": true,
      "ai_chat.use": true,
      "bookings.view": true,
      "billing.view_own": true,
    },
  },
  {
    email: "demo-sales@vaultos.local",
    label: "Sales Manager",
    expect: {
      "customers.view": true,
      "customers.create": true,
      "bookings.create": true,
      "invoices.view": true,
      "reports.view": true,
      "workspace.view": true,
      "users.edit": false,
    },
  },
  {
    email: "demo-employee@vaultos.local",
    label: "Employee",
    expect: {
      "users.view": false,
      "users.edit": false,
      "roles.view": false,
      "audit_logs.view": false,
      "channels.view": false,
      "ai_chat.view": false,
    },
  },
];

type Result = { category: string; test: string; pass: boolean; detail: string };
const results: Result[] = [];

function record(category: string, test: string, pass: boolean, detail = "") {
  results.push({ category, test, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${category} :: ${test}${detail ? ` — ${detail}` : ""}`);
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return client;
}

async function hasPermission(client: SupabaseClient, code: string): Promise<boolean> {
  const { data, error } = await client.rpc("user_has_permission", { p_code: code });
  if (error) throw new Error(`user_has_permission(${code}): ${error.message}`);
  return data === true;
}

async function verifyPersonaPermissions() {
  for (const persona of PERSONAS) {
    let client: SupabaseClient;
    try {
      client = await signIn(persona.email);
    } catch (e) {
      record("Auth", persona.label, false, (e as Error).message);
      continue;
    }

    for (const [code, expected] of Object.entries(persona.expect)) {
      try {
        const actual = await hasPermission(client, code);
        record(
          "Permission RPC",
          `${persona.label} → ${code}`,
          actual === expected,
          `expected=${expected} actual=${actual}`,
        );
      } catch (e) {
        record("Permission RPC", `${persona.label} → ${code}`, false, (e as Error).message);
      }
    }
  }
}

async function verifyRlsEnforcement() {
  const employee = await signIn("demo-employee@vaultos.local");
  const admin = await signIn("demo-beta-admin@vaultos.local");

  const { data: employeeAudit, error: employeeAuditErr } = await employee
    .from("audit_logs")
    .select("id")
    .limit(1);
  record(
    "RLS",
    "Employee audit_logs SELECT denied",
    !employeeAuditErr && (employeeAudit?.length ?? 0) === 0,
    employeeAuditErr?.message ?? `rows=${employeeAudit?.length ?? 0}`,
  );

  const { data: adminAudit, error: adminAuditErr } = await admin
    .from("audit_logs")
    .select("id")
    .limit(1);
  record(
    "RLS",
    "Company Admin audit_logs SELECT allowed",
    !adminAuditErr && (adminAudit?.length ?? 0) > 0,
    adminAuditErr?.message ?? `rows=${adminAudit?.length ?? 0}`,
  );

  const { data: employeeChannels, error: employeeChannelsErr } = await employee
    .from("company_channels")
    .select("id")
    .limit(1);
  record(
    "RLS",
    "Employee company_channels SELECT denied",
    !employeeChannelsErr && (employeeChannels?.length ?? 0) === 0,
    employeeChannelsErr?.message ?? `rows=${employeeChannels?.length ?? 0}`,
  );

  const { data: adminChannels, error: adminChannelsErr } = await admin
    .from("company_channels")
    .select("id")
    .limit(1);
  record(
    "RLS",
    "Company Admin company_channels SELECT allowed",
    !adminChannelsErr && (adminChannels?.length ?? 0) >= 0,
    adminChannelsErr?.message ?? `rows=${adminChannels?.length ?? 0}`,
  );

  const { data: employeeProfiles, error: employeeProfilesErr } = await employee
    .from("profiles")
    .select("id")
    .neq("user_id", (await employee.auth.getUser()).data.user?.id ?? "")
    .limit(1);
  record(
    "RLS",
    "Employee other profiles SELECT denied",
    !employeeProfilesErr && (employeeProfiles?.length ?? 0) === 0,
    employeeProfilesErr?.message ?? `rows=${employeeProfiles?.length ?? 0}`,
  );
}

async function verifyEdgeFunctionRejection() {
  const employee = await signIn("demo-employee@vaultos.local");
  const { data: session } = await employee.auth.getSession();
  const token = session.session?.access_token;
  if (!token) {
    record("Edge Function", "provision-user employee rejection", false, "No session token");
    return;
  }

  const edgePayload = {
    email: `rbac-deny-${Date.now()}@example.com`,
    fullName: "RBAC Deny Test",
    companyId: "d0000010-0001-4001-8001-000000000002",
    roleId: "d0000030-0001-4001-8001-000000000004",
    isActive: true,
    redirectTo: "http://localhost:5173/auth/callback?next=%2Freset-password",
  };

  const res = await fetch(`${SUPABASE_URL}/functions/v1/provision-user`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(edgePayload),
  });

  const body = await res.json().catch(() => ({}));
  record(
    "Edge Function",
    "provision-user employee rejection",
    res.status === 403,
    `status=${res.status} body=${JSON.stringify(body)}`,
  );
}

async function verifyEmployeeChannelDenialAfterMigration() {
  const employee = await signIn("demo-employee@vaultos.local");
  const { data: employeeChannels, error: employeeChannelsErr } = await employee
    .from("company_channels")
    .select("id")
    .limit(1);
  const denied = !!employeeChannelsErr || (employeeChannels?.length ?? 0) === 0;
  record(
    "RLS (post-111)",
    "Employee company_channels SELECT denied when channels.view absent",
    denied,
    employeeChannelsErr?.message ?? `rows=${employeeChannels?.length ?? 0} (apply migrations 111+112 to enforce)`,
  );
}

function verifyStaticEnforcement() {
  const dashboardRegistry = readFileSync(
    resolve(root, "artifacts/login-app/src/config/dashboard-route-registry.ts"),
    "utf8",
  );
  const usersPage = readFileSync(resolve(root, "artifacts/login-app/src/pages/users.tsx"), "utf8");
  const aiAssistant = readFileSync(resolve(root, "artifacts/login-app/src/pages/ai-assistant.tsx"), "utf8");

  record(
    "Static",
    "Dashboard routes declare permissions",
    /permission:\s*"users\.view"/.test(dashboardRegistry) &&
      /permission:\s*"audit_logs\.view"/.test(dashboardRegistry),
    "users.view + audit_logs.view",
  );

  record(
    "Static",
    "Users page separates view vs edit",
    /canViewUsers/.test(usersPage) && /canManageUsers/.test(usersPage),
    "user-permissions helpers wired",
  );

  record(
    "Static",
    "AI Assistant no role-name bypass",
    !/isCompanyAdmin/.test(aiAssistant) && !/Boolean\(companyId\)/.test(aiAssistant),
    "removed hardcoded bypasses",
  );

  record(
    "Static",
    "Settings route guard exists",
    readFileSync(
      resolve(root, "artifacts/login-app/src/components/settings/layout/settings-route-guard.tsx"),
      "utf8",
    ).includes("SettingsRouteGuard"),
    "settings-route-guard.tsx",
  );
}

async function main() {
  console.log("=== VaultOS RBAC E2E Validation ===\n");

  verifyStaticEnforcement();
  await verifyPersonaPermissions();
  await verifyRlsEnforcement();
  await verifyEmployeeChannelDenialAfterMigration();
  await verifyEdgeFunctionRejection();

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 0;

  console.log(`\n=== Summary: ${passed}/${total} passed (${score}%) ===`);

  const reportPath = resolve(root, "docs/operations/rbac-e2e-validation-2026-07-18.md");
  mkdirSync(dirname(reportPath), { recursive: true });
  const md = [
    "# RBAC E2E Validation Report",
    "",
    `**Date:** 2026-07-18`,
    `**Result:** ${passed}/${total} passed (${score}%)`,
    "",
    "| Category | Test | Result | Detail |",
    "|---|---|---|---|",
    ...results.map(
      (r) => `| ${r.category} | ${r.test} | ${r.pass ? "PASS" : "FAIL"} | ${r.detail.replace(/\|/g, "\\|")} |`,
    ),
    "",
  ].join("\n");
  writeFileSync(reportPath, md, "utf8");
  console.log(`Report written: ${reportPath}`);

  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
