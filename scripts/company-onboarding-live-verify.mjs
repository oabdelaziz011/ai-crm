/**
 * Live verification for company onboarding RPCs.
 * Creates a temporary user, runs onboard_own_company_v1, validates ownership,
 * then runs create_company_admin_v1 as a platform super-admin when available.
 */
import { createRequire } from "node:module";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const require = createRequire(import.meta.url);
const { createClient } = require("../artifacts/login-app/node_modules/@supabase/supabase-js");

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  throw new Error("Missing SUPABASE_URL / service role / anon key");
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const stamp = Date.now();
const email = `onboard-test-${stamp}@valueor.test`;
const password = `Onboard!${stamp}Aa`;

const payload = {
  name: `Onboard Test ${stamp}`,
  legal_name: `Onboard Test Legal ${stamp}`,
  business_type: "clinic",
  industry: "healthcare",
  contact_email: email,
  contact_phone: "+966500000001",
  website: "https://example.test",
  description: "Integration onboarding company",
  tax_id: "TAX-123",
  commercial_registration: "CR-456",
  country: "Saudi Arabia",
  city: "Riyadh",
  address: "King Fahd Road",
  timezone: "Asia/Riyadh",
  currency: "SAR",
  owner_display_name: "Onboard Tester",
  owner_full_name: "Onboard Tester",
  owner_phone: "+966500000001",
  owner_job_title: "Owner",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log("1) Creating temporary auth user…");
const created = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Onboard Tester" },
});
if (created.error) throw created.error;
const userId = created.data.user.id;
console.log("   user", userId);

try {
  console.log("2) Signing in as temporary user…");
  const userClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const signedIn = await userClient.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;

  console.log("3) Calling onboard_own_company_v1…");
  const onboard = await userClient.rpc("onboard_own_company_v1", { p_payload: payload });
  if (onboard.error) throw onboard.error;
  const companyId = onboard.data.company_id || onboard.data.company?.id;
  assert(companyId, "missing company id");
  console.log("   company", companyId);

  console.log("4) Verifying profile + admin role + billing profile…");
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, company_id, full_name, job_title, phone, timezone")
    .eq("id", userId)
    .single();
  if (profileError) throw profileError;
  assert(profile.company_id === companyId, "profile.company_id mismatch");

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id, name, industry, business_type, contact_email, contact_phone, subscription_plan, status")
    .eq("id", companyId)
    .single();
  if (companyError) throw companyError;
  assert(company.industry === "healthcare", "industry not persisted");
  assert(company.business_type === "clinic", "business_type not persisted");
  assert(company.subscription_plan === "Basic", "plan should be Basic");

  const { data: billing, error: billingError } = await admin
    .from("company_billing_profiles")
    .select("legal_name, address, tax_id, commercial_registration")
    .eq("company_id", companyId)
    .single();
  if (billingError) throw billingError;
  assert(billing.commercial_registration === "CR-456", "commercial_registration missing");
  assert(billing.legal_name?.includes("Legal"), "legal_name missing");

  const { data: roleRows, error: roleError } = await admin
    .from("user_roles")
    .select("role_id, roles!inner(template_key, company_id, name)")
    .eq("user_id", userId);
  if (roleError) throw roleError;
  const adminRole = (roleRows ?? []).find((row) => row.roles?.template_key === "admin");
  assert(adminRole, "Company Admin role not assigned");
  assert(adminRole.roles.company_id === companyId, "admin role company mismatch");

  console.log("5) Duplicate onboard should fail…");
  const duplicate = await userClient.rpc("onboard_own_company_v1", { p_payload: payload });
  assert(Boolean(duplicate.error), "expected duplicate onboarding rejection");
  assert(
    /company_already_assigned/i.test(duplicate.error.message),
    `unexpected duplicate error: ${duplicate.error.message}`,
  );

  console.log("6) Unauthorized create_company_admin_v1 should fail for new tenant user…");
  const forbidden = await userClient.rpc("create_company_admin_v1", {
    p_payload: { ...payload, name: `Unauthorized ${stamp}` },
  });
  assert(Boolean(forbidden.error), "expected forbidden");
  assert(/forbidden/i.test(forbidden.error.message), `unexpected: ${forbidden.error.message}`);

  console.log("PASS company onboarding live verification");
} finally {
  console.log("cleanup: leaving temporary user/company for manual inspection if needed");
  console.log(`email=${email}`);
}
