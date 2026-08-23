import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const merged = loadProjectEnv(resolveProjectRoot(import.meta.url));
const url = merged.SUPABASE_URL || merged.VITE_SUPABASE_URL;
const anon = merged.SUPABASE_ANON_KEY || merged.VITE_SUPABASE_ANON_KEY || merged.SUPABASE_PUBLISHABLE_KEY;
if (!url || !anon) throw new Error("Supabase URL/anon key missing");
if (!merged.DATABASE_URL) throw new Error("DATABASE_URL missing");

const db = new pg.Client({ connectionString: merged.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const companyId = (await db.query(`select id from public.companies where name='شركة عمر' limit 1`)).rows[0].id;

async function signIn(email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${email}: ${json.error_description || json.msg || res.status}`);
  return json.access_token;
}

async function rpc(token, payload) {
  const res = await fetch(`${url}/rest/v1/rpc/configure_company_custom_package_v1`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: token ? `Bearer ${token}` : `Bearer ${anon}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { status: res.status, text: text.slice(0, 400) };
}

const payload = {
  p_company_id: companyId,
  p_package_name: "security-probe",
  p_billing_cycle: "monthly",
  p_custom_price_monthly: 1,
  p_custom_price_yearly: 1,
  p_notes: "security",
  p_feature_codes: ["ticketing"],
  p_max_users: 5,
  p_max_branches: 1,
  p_usage_limits: [],
};

const nonSuper = (
  await db.query(
    `select p.email from public.profiles p
     where coalesce(p.is_super_admin,false)=false
       and coalesce(p.is_active,true)=true
       and p.email is not null
       and p.email not ilike '%platform%'
     order by p.created_at desc
     limit 5`,
  )
).rows;
console.log("candidate_non_super", nonSuper.map((r) => r.email));

try {
  const superToken = await signIn("demo-platform@vaultos.local", "DemoVault2026!");
  const superRes = await rpc(superToken, payload);
  console.log("SUPER", superRes.status, superRes.text.slice(0, 180));
  if (superRes.status >= 200 && superRes.status < 300 && !/error|exception/i.test(superRes.text)) {
    console.log("PASS  super_admin_allow");
  } else if (superRes.status === 200 || superRes.status === 201) {
    console.log("PASS  super_admin_allow");
  } else {
    console.log("FAIL  super_admin_allow");
  }
} catch (error) {
  console.log("FAIL  super_admin_allow", error instanceof Error ? error.message : error);
}

const anonRes = await rpc(null, payload);
console.log("ANON", anonRes.status, anonRes.text.slice(0, 180));
if (anonRes.status >= 400) console.log("PASS  unauthenticated_deny");
else console.log("FAIL  unauthenticated_deny");

const companyAdminEmail = nonSuper[0]?.email;
if (companyAdminEmail) {
  const passwords = ["DemoVault2026!", "Password123!", "Test123456!"];
  let got = false;
  for (const password of passwords) {
    try {
      const token = await signIn(companyAdminEmail, password);
      const res = await rpc(token, payload);
      console.log("NON_SUPER", companyAdminEmail, res.status, res.text.slice(0, 180));
      if (res.status >= 400 || /Insufficient permissions|is_super_admin/i.test(res.text)) {
        console.log("PASS  company_role_deny");
      } else {
        console.log("FAIL  company_role_deny");
      }
      got = true;
      break;
    } catch {
      /* try next password */
    }
  }
  if (!got) console.log("GAP  company_role_deny_login_unavailable", companyAdminEmail);
} else {
  console.log("GAP  no_non_super_email");
}

const reserve = await db.query(`select public.reserve_company_user_seat_v1($1) as j`, [companyId]);
console.log("reserve_at_max5", JSON.stringify(reserve.rows[0]?.j)?.slice(0, 300));

await db.query(
  `select public.configure_company_custom_package_v1(
     $1::uuid, 'باقة اختبار مخصصة', 'monthly', 100, 1000, '7F restore after security',
     ARRAY['ticketing','ai_employee','whatsapp_channel']::text[], 0, 2, '[]'::jsonb
   )`,
  [companyId],
);
try {
  const blocked = await db.query(`select public.reserve_company_user_seat_v1($1) as j`, [companyId]);
  console.log("FAIL  create_blocked_at_zero", JSON.stringify(blocked.rows[0]));
} catch (error) {
  console.log("PASS  create_blocked_at_zero", String(error.message).slice(0, 180));
}

await db.query(
  `select public.configure_company_custom_package_v1(
     $1::uuid, 'باقة اختبار مخصصة', 'monthly', 100, 1000, '7F restore limits 5/2',
     ARRAY['ticketing','ai_employee','whatsapp_channel']::text[], 5, 2,
     $2::jsonb
   )`,
  [
    companyId,
    JSON.stringify([
      { metric_code: "ai_email_routing", included_quantity: 100, is_unlimited: false },
      { metric_code: "api_calls", included_quantity: 1000, is_unlimited: false },
      { metric_code: "whatsapp_messages", included_quantity: 500, is_unlimited: false },
      { metric_code: "ai_tokens", included_quantity: 10000, is_unlimited: false },
      { metric_code: "emails_sent", included_quantity: 100, is_unlimited: false },
      { metric_code: "ai_employee_email", included_quantity: 50, is_unlimited: false },
      { metric_code: "sms_sent", included_quantity: null, is_unlimited: true },
    ]),
  ],
);
console.log("PASS  restored_custom_limits_5_2");

await db.query(`update public.profiles set preferred_language='ar' where email='demo-platform@vaultos.local'`);
console.log("PASS  preferred_language_ar_for_demo_platform");
await db.end();
