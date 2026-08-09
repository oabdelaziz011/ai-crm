import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const env: Record<string, string> = {};
for (const p of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || "";

const { supabase } = await import("../src/lib/supabase.ts");
const { error: authErr } = await supabase.auth.signInWithPassword({
  email: "demo-platform@vaultos.local",
  password: "DemoVault2026!",
});
if (authErr) {
  console.error("AUTH", authErr.message);
  process.exit(1);
}

const { data: sess } = await supabase.auth.getSession();
const userId = sess.session?.user.id;
if (!userId) throw new Error("No session");

const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
const companyId = profile?.company_id;
if (!companyId) throw new Error("No company");

const { data: pipeline } = await supabase
  .from("lead_pipelines")
  .select("id")
  .eq("company_id", companyId)
  .eq("is_default", true)
  .maybeSingle();

const { data: stages } = await supabase
  .from("lead_stages")
  .select("id,name,lifecycle_status")
  .eq("company_id", companyId)
  .eq("pipeline_id", pipeline?.id ?? "")
  .order("sort_order");

const qualifiedStage = stages?.find((s) => /qualified/i.test(s.name) || s.lifecycle_status === "qualified") ?? stages?.[0];
if (!qualifiedStage) throw new Error("No lead stage");

const title = `Sprint45 E2E ${Date.now()}`;
const { data: lead, error: leadErr } = await supabase
  .from("leads")
  .insert({
    company_id: companyId,
    pipeline_id: pipeline!.id,
    stage_id: qualifiedStage.id,
    title,
    contact_name: "E2E Contact",
    company_name: "E2E Verify Corp",
    assigned_user_id: userId,
    estimated_value: 75000,
    currency: "EGP",
    is_qualified: true,
    created_by: userId,
  })
  .select("id,title,company_name,contact_name,is_qualified")
  .single();

if (leadErr) {
  console.error("LEAD_ERR", leadErr);
  process.exit(1);
}

console.log(JSON.stringify({ companyId, lead, qualifiedStage: qualifiedStage.name }, null, 2));
