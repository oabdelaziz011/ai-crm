/**
 * P1d local-only verification. Refuses non-127.0.0.1 targets.
 * Does not print secrets.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import assert from "node:assert/strict";
import {
  createSupabaseCompanyLeadQualificationSettingsStore,
  createLeadPlatformServices,
  InMemoryLeadQueryCache,
} from "../src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");

const LOCAL_API = /^https?:\/\/(127\.0\.0\.1|localhost):54321\/?$/i;
const LOCAL_DB = /@(127\.0\.0\.1|localhost):54322\//;

function loadEnv() {
  const out = {};
  for (const f of [".env", ".env.localstack"]) {
    const p = resolve(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      out[t.slice(0, i).trim()] = v;
    }
  }
  return out;
}

function assertLocal(env) {
  if (!LOCAL_API.test(env.SUPABASE_URL ?? "")) {
    throw new Error("Refusing: SUPABASE_URL is not local 127.0.0.1:54321");
  }
  if (env.DATABASE_URL && !LOCAL_DB.test(env.DATABASE_URL)) {
    throw new Error("Refusing: DATABASE_URL is not local 127.0.0.1:54322");
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  }
}

const results = [];
function ok(name) {
  results.push({ name, pass: true });
  console.log(`PASS ${name}`);
}
function fail(name, err) {
  results.push({ name, pass: false, err: String(err?.message ?? err) });
  console.error(`FAIL ${name}:`, err?.message ?? err);
}

const env = loadEnv();
assertLocal(env);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

{
  const { error } = await admin.from("lead_qualification_settings").select("company_id").limit(1);
  if (error) fail("table_exists", error);
  else ok("table_exists");
}

const { data: companies, error: companiesErr } = await admin.from("companies").select("id").limit(5);
if (companiesErr || !companies || companies.length < 2) {
  fail("find_two_companies", companiesErr ?? new Error("need >= 2 companies in local DB"));
  console.log(JSON.stringify({ summary: results }, null, 2));
  process.exit(1);
}
const companyA = companies[0].id;
const companyB = companies[1].id;

const { data: profilesA, error: profilesErr } = await admin
  .from("profiles")
  .select("user_id")
  .eq("company_id", companyA)
  .not("user_id", "is", null)
  .limit(1);
if (profilesErr || !profilesA?.[0]?.user_id) {
  fail("find_company_user", profilesErr ?? new Error("no profile user for company A"));
  console.log(JSON.stringify({ summary: results }, null, 2));
  process.exit(1);
}
const actorUserId = profilesA[0].user_id;

const store = createSupabaseCompanyLeadQualificationSettingsStore(admin);

// Cleanup via postgres (no DELETE grant on table for API roles)
const { spawnSync } = await import("node:child_process");
spawnSync(
  "docker",
  [
    "exec",
    "-i",
    "supabase_db_project",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `delete from public.lead_qualification_settings where company_id in ('${companyA}','${companyB}');`,
  ],
  { stdio: "ignore" },
);

try {
  const resolved = await store.resolve(companyA);
  assert.equal(resolved.settings.source, "defaults");
  assert.equal(resolved.settings.salesMotion, "b2c");
  assert.equal(resolved.settings.companyId, companyA);
  ok("missing_settings_defaults");
} catch (e) {
  fail("missing_settings_defaults", e);
}

try {
  await store.upsert(companyA, {
    salesMotion: "b2b",
    requiredEvidenceFields: [
      "statedNeed",
      "explicitBuyingIntent",
      "contactAvailable",
      "companyIdentified",
    ],
  });
  await store.upsert(companyB, {
    salesMotion: "mixed",
    requiredEvidenceFields: [
      "statedNeed",
      "productInterest",
      "contactAvailable",
      "explicitBuyingIntent",
    ],
  });
  const a = await store.get(companyA);
  const b = await store.get(companyB);
  assert.equal(a.salesMotion, "b2b");
  assert.equal(b.salesMotion, "mixed");
  assert.ok(a.requiredEvidenceFields.includes("companyIdentified"));
  assert.ok(!b.requiredEvidenceFields.includes("companyIdentified"));
  ok("company_settings_isolation");
} catch (e) {
  fail("company_settings_isolation", e);
}

try {
  assert.equal(await store.get("00000000-0000-0000-0000-000000000000"), null);
  ok("missing_company_null");
} catch (e) {
  fail("missing_company_null", e);
}

const platform = createLeadPlatformServices(admin, {
  qualificationSettingsStore: store,
  assignmentGovernance: false,
  assignmentAudit: false,
  cache: new InMemoryLeadQueryCache(),
});

const manageCtx = {
  userId: actorUserId,
  companyId: companyA,
  isSuperAdmin: false,
  hasPermission: (code) =>
    ["leads.manage", "leads.view", "leads.qualify", "leads.create", "leads.edit"].includes(code),
};
const noManageCtx = {
  ...manageCtx,
  hasPermission: (code) => code === "leads.qualify" || code === "leads.view",
};

try {
  await platform.commands.upsertLeadQualificationSettings(noManageCtx, {
    companyId: companyA,
    patch: { salesMotion: "b2c" },
  });
  fail("unauthorized_upsert_rejected", new Error("expected permission denial"));
} catch (e) {
  if (/leads\.manage/.test(String(e.message ?? e))) ok("unauthorized_upsert_rejected");
  else fail("unauthorized_upsert_rejected", e);
}

try {
  await platform.commands.upsertLeadQualificationSettings(manageCtx, {
    companyId: companyB,
    patch: { salesMotion: "b2c" },
  });
  fail("cross_company_upsert_rejected", new Error("expected company.access denial"));
} catch (e) {
  if (/company\.access/.test(String(e.message ?? e))) ok("cross_company_upsert_rejected");
  else fail("cross_company_upsert_rejected", e);
}

try {
  const got = await platform.commands.getLeadQualificationSettings(manageCtx, { companyId: companyA });
  assert.equal(got.settings.salesMotion, "b2b");
  ok("authorized_read_works");
} catch (e) {
  fail("authorized_read_works", e);
}

try {
  // No companyName — observational evidence must not invent companyIdentified.
  const created = await platform.commands.createLead(manageCtx, {
    companyId: companyA,
    title: "P1d verify lead",
    phone: "+201000000099",
  });
  const leadId = created.lead.id;
  try {
    await platform.commands.qualifyLead(manageCtx, {
      companyId: companyA,
      leadId,
      qualificationPolicyMode: "enforce",
      evidence: {
        statedNeed: true,
        explicitBuyingIntent: true,
        contactAvailable: true,
      },
    });
    fail("qualify_uses_persisted_b2b", new Error("expected policy rejection"));
  } catch (e) {
    if (/companyIdentified|needs_more_information|Qualification policy rejected/i.test(String(e.message ?? e))) {
      ok("qualify_uses_persisted_b2b");
    } else {
      fail("qualify_uses_persisted_b2b", e);
    }
  }
  const q = await platform.commands.qualifyLead(manageCtx, {
    companyId: companyA,
    leadId,
    qualificationPolicyMode: "enforce",
    evidence: {
      statedNeed: true,
      explicitBuyingIntent: true,
      contactAvailable: true,
      companyIdentified: true,
    },
  });
  assert.equal(q.qualificationApplied, true);
  assert.equal(q.policy.salesMotion, "b2b");
  ok("qualify_success_with_persisted_settings");
} catch (e) {
  fail("qualify_flow", e);
}

spawnSync(
  "docker",
  [
    "exec",
    "-i",
    "supabase_db_project",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-c",
    `delete from public.lead_qualification_settings where company_id in ('${companyA}','${companyB}');`,
  ],
  { stdio: "ignore" },
);

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
console.log(JSON.stringify({ passed, failed, results }, null, 2));
process.exit(failed ? 1 : 0);
