import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { writeResetEmployeePasswordAudit } from "./audit.ts";
import {
  authorizeEmployeePasswordReset,
  isUuid,
  validatePasswordPair,
} from "./validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CallerProfile = {
  id: string;
  company_id: string | null;
  is_super_admin: boolean;
};

type TargetProfile = {
  id: string;
  email: string | null;
  company_id: string | null;
  is_super_admin: boolean | null;
  is_active: boolean | null;
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

function deny(status = 403, code = "request_denied") {
  return jsonResponse({ error: code }, status);
}

function badRequest(code: string) {
  return jsonResponse({ error: code }, 400);
}

async function callerHasManagePermission(
  supabaseUser: ReturnType<typeof createClient>,
): Promise<boolean> {
  for (const code of ["employees.manage", "users.edit"]) {
    const { data, error } = await supabaseUser.rpc("user_has_permission", { p_code: code });
    if (error) {
      console.error(`user_has_permission(${code}) failed`, error.message);
      continue;
    }
    if (data === true) return true;
  }
  return false;
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

  const companyId = typeof body.companyId === "string" ? body.companyId : null;
  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : null;
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (!isUuid(targetUserId)) {
    return badRequest("invalid_target");
  }
  if (companyId != null && !isUuid(companyId)) {
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

  const { data: callerRow, error: callerError } = await supabaseAdmin
    .from("profiles")
    .select("id, company_id, is_super_admin")
    .eq("id", callerId)
    .maybeSingle();
  if (callerError || !callerRow) {
    return deny(403);
  }
  const caller = callerRow as CallerProfile;
  const hasManagePermission = caller.is_super_admin
    ? true
    : await callerHasManagePermission(supabaseUser);

  const { data: targetRow, error: targetError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, company_id, is_super_admin, is_active")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetError) {
    console.error("reset-employee-password: load target failed", targetError.message);
    return jsonResponse({ error: "auth_provider_failure" }, 502);
  }
  const target = (targetRow as TargetProfile | null) ?? null;

  const authz = authorizeEmployeePasswordReset({
    callerIsSuperAdmin: caller.is_super_admin === true,
    callerCompanyId: caller.company_id,
    hasManagePermission,
    requestedCompanyId: companyId,
    targetUserId,
    targetCompanyId: target?.company_id ?? null,
    targetIsSuperAdmin: target?.is_super_admin === true,
    targetExists: Boolean(target?.id),
  });

  if (!authz.ok) {
    await writeResetEmployeePasswordAudit(supabaseAdmin, {
      callerUserId: callerId,
      callerCompanyId: caller.company_id,
      targetCompanyId: target?.company_id ?? companyId,
      targetUserId,
      result: "failure",
      reason: authz.reason,
    });
    return deny(403, authz.reason);
  }

  if (!target?.email) {
    await writeResetEmployeePasswordAudit(supabaseAdmin, {
      callerUserId: callerId,
      callerCompanyId: caller.company_id,
      targetCompanyId: authz.effectiveCompanyId,
      targetUserId,
      result: "failure",
      reason: "target_not_found",
    });
    return deny(404, "target_not_found");
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(target.id, {
    password: newPassword,
  });

  body.newPassword = "";
  body.confirmPassword = "";

  if (updateError) {
    console.error("reset-employee-password: updateUserById failed", updateError.message);
    await writeResetEmployeePasswordAudit(supabaseAdmin, {
      callerUserId: callerId,
      callerCompanyId: caller.company_id,
      targetCompanyId: authz.effectiveCompanyId,
      targetUserId: target.id,
      result: "failure",
      reason: "auth_provider_failure",
    });
    return jsonResponse({ error: "auth_provider_failure" }, 502);
  }

  // Session invalidation: auth.admin.updateUserById({ password })
  // revokes existing refresh tokens (verified live). auth.admin.signOut
  // currently returns bad_jwt with the service-role client, so it is NOT
  // used as a hard dependency.
  await writeResetEmployeePasswordAudit(supabaseAdmin, {
    callerUserId: callerId,
    callerCompanyId: caller.company_id,
    targetCompanyId: authz.effectiveCompanyId,
    targetUserId: target.id,
    result: "success",
  });

  // Response must NEVER include the password.
  return jsonResponse({
    ok: true,
    companyId: authz.effectiveCompanyId,
    targetUserId: target.id,
    targetEmail: target.email,
  });
});
