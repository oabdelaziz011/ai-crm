/**
 * Live CRUD + tenant-scope smoke for company_email_templates (Sprint 1).
 * Requires demo credentials / env from repo .env files.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const env: Record<string, string> = {};
for (const p of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
const anon = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || "";
if (!url || !anon) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const sb = createClient(url, anon);
const { error: authErr } = await sb.auth.signInWithPassword({
  email: "demo-platform@vaultos.local",
  password: "DemoVault2026!",
});
if (authErr) throw authErr;

const {
  data: { user },
  error: userErr,
} = await sb.auth.getUser();
if (userErr || !user) throw userErr ?? new Error("No user");

const { data: profile, error: profileErr } = await sb
  .from("profiles")
  .select("company_id")
  .eq("id", user.id)
  .maybeSingle();
if (profileErr) throw profileErr;
const companyId = profile?.company_id as string | undefined;
assert.ok(companyId, "missing company_id");

const code = `welcome_customer_${Date.now().toString(36)}`;
const { data: created, error: createErr } = await sb
  .from("company_email_templates")
  .insert({
    company_id: companyId,
    name: "Welcome Customer",
    code,
    subject: "Welcome {{customer.name}}",
    body: "Hello {{customer.name}}, welcome to {{company.name}}.",
    enabled: true,
  })
  .select("id, company_id, name, code")
  .single();
if (createErr) throw createErr;
assert.equal(created.company_id, companyId);

const { data: listed, error: listErr } = await sb
  .from("company_email_templates")
  .select("id")
  .eq("company_id", companyId)
  .eq("code", code);
if (listErr) throw listErr;
assert.equal(listed?.length, 1);

// Cross-company forge attempt must fail RLS (wrong company_id)
const { error: crossErr } = await sb.from("company_email_templates").insert({
  company_id: "00000000-0000-4000-8000-000000000099",
  name: "Cross Company",
  code: `x_${Date.now().toString(36)}`,
  subject: "x",
  body: "x",
  enabled: true,
});
assert.ok(crossErr, "expected cross-company insert to be rejected by RLS");

const { error: delErr } = await sb
  .from("company_email_templates")
  .delete()
  .eq("id", created.id)
  .eq("company_id", companyId);
if (delErr) throw delErr;

console.log(
  JSON.stringify({
    ok: true,
    companyId,
    createdId: created.id,
    crossCompanyRejected: true,
  }),
);
