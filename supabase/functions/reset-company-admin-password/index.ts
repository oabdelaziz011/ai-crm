import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { writeResetAdminPasswordAudit } from "./audit.ts";
import { isUuid, validatePasswordPair } from "./validation.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CallerProfile = {
  id: string;
  company_id: string | null;
  is_super_admin: boolean;
};

type CompanyAdminRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  company_id: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

/** Generic client error — do not leak cross-tenant existence details. */
function deny(status = 403) {
  return jsonResponse({ error: "request_denied" }, status);
}

function badRequest(code: string) {
  return jsonResponse({ error: code }, 400);
}

async function loadCallerProfile(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<CallerProfile | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, company_id, is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("reset-admin-password: load caller failed", error.message);
    return null;
  }
  return (data as CallerProfile | null) ?? null;
}

/**
 * Resolve the company's Company Admin login user.
 * Deterministic: earliest active profile with roles.template_key = 'admin'
 * for this company. Never uses companies.contact_email.
 */
async function resolveCompanyAdmin(
  supabaseAdmin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<CompanyAdminRow | null> {
  const { data: roles, error: rolesError } = await supabaseAdmin
    .from("roles")
    .select("id")
    .eq("company_id", companyId)
    .eq("template_key", "admin");

  if (rolesError) {
    console.error("reset-admin-password: roles lookup failed", rolesError.message);
    return null;
  }
  const roleIds = (roles ?? []).map((r: { id: string }) => r.id).filter(Boolean);
  if (roleIds.length === 0) return null;

  const { data: assignments, error: assignError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("role_id", roleIds);

  if (assignError) {
    console.error("reset-admin-password: user_roles lookup failed", assignError.message);
    return null;
  }
  const userIds = [...new Set((assignments ?? []).map((a: { user_id: string }) => a.user_id).filter(Boolean))];
  if (userIds.length === 0) return null;

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, company_id, is_active, created_at")
    .in("id", userIds)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (profileError) {
    console.error("reset-admin-password: profiles lookup failed", profileError.message);
    return null;
  }
  const rows = (profiles ?? []) as CompanyAdminRow[];
  return rows[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest("invalid_body");
  }

  const companyId = body.companyId;
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  // Optional client hint — NEVER trusted alone; server re-resolves admin.
  const claimedAdminUserId = body.adminUserId;

  if (!isUuid(companyId)) {
    return badRequest("invalid_company");
  }

  const policy = validatePasswordPair(newPassword, confirmPassword);
  if (!policy.ok) {
    return badRequest(policy.code);
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const callerId = userData.user.id;
  const caller = await loadCallerProfile(supabaseAdmin, callerId);
  if (!caller?.is_super_admin) {
    await writeResetAdminPasswordAudit(supabaseAdmin, {
      callerUserId: callerId,
      callerCompanyId: caller?.company_id ?? null,
      targetCompanyId: companyId,
      targetAdminUserId: null,
      result: "failure",
      reason: "unauthorized",
    });
    return deny(403);
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, name, contact_email")
    .eq("id", companyId)
    .maybeSingle();

  if (companyError || !company) {
    await writeResetAdminPasswordAudit(supabaseAdmin, {
      callerUserId: callerId,
      callerCompanyId: caller.company_id,
      targetCompanyId: companyId,
      targetAdminUserId: null,
      result: "failure",
      reason: "company_not_found",
    });
    return deny(404);
  }

  const admin = await resolveCompanyAdmin(supabaseAdmin, companyId);
  if (!admin?.id || !admin.email) {
    await writeResetAdminPasswordAudit(supabaseAdmin, {
      callerUserId: callerId,
      callerCompanyId: caller.company_id,
      targetCompanyId: companyId,
      targetAdminUserId: null,
      result: "failure",
      reason: "admin_not_found",
    });
    return deny(404);
  }

  // Reject stale/manipulated client adminUserId mismatch.
  if (claimedAdminUserId != null && claimedAdminUserId !== "" && claimedAdminUserId !== admin.id) {
    await writeResetAdminPasswordAudit(supabaseAdmin, {
      callerUserId: callerId,
      callerCompanyId: caller.company_id,
      targetCompanyId: companyId,
      targetAdminUserId: admin.id,
      result: "failure",
      reason: "admin_mismatch",
    });
    return deny(409);
  }

  // Never target contact_email as auth identity — admin.email is profiles/auth login.
  if (
    typeof company.contact_email === "string" &&
    company.contact_email.trim() &&
    admin.email.trim().toLowerCase() === company.contact_email.trim().toLowerCase()
  ) {
    // Same string is allowed when contact happens to equal login; still use admin.id.
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(admin.id, {
    password: newPassword,
  });

  // Wipe locals (best-effort; request body is still in memory briefly).
  body.newPassword = "";
  body.confirmPassword = "";

  if (updateError) {
    console.error("reset-admin-password: updateUserById failed", updateError.message);
    await writeResetAdminPasswordAudit(supabaseAdmin, {
      callerUserId: callerId,
      callerCompanyId: caller.company_id,
      targetCompanyId: companyId,
      targetAdminUserId: admin.id,
      result: "failure",
      reason: "auth_provider_failure",
    });
    return jsonResponse({ error: "auth_provider_failure" }, 502);
  }

  // Session invalidation: on this Auth/GoTrue stack, auth.admin.updateUserById({ password })
  // revokes existing refresh tokens (verified live). auth.admin.signOut(userId, "global")
  // currently returns bad_jwt with the service-role client, so it is NOT used as a
  // hard dependency (would flip a successful reset into a false failure).

  await writeResetAdminPasswordAudit(supabaseAdmin, {
    callerUserId: callerId,
    callerCompanyId: caller.company_id,
    targetCompanyId: companyId,
    targetAdminUserId: admin.id,
    result: "success",
  });

  // Response must NEVER include the password.
  return jsonResponse({
    ok: true,
    companyId,
    adminUserId: admin.id,
    adminEmail: admin.email,
  });
});
