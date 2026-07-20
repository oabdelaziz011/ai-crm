import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { writeProvisionRejectionAudit } from "./audit.ts";
import {
  type ProvisionRole,
  type ProvisionTargetProfile,
  validateProvisionRequest,
} from "./validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ProvisionUserPayload = {
  email?: string;
  fullName?: string;
  companyId?: string;
  roleId?: string;
  isActive?: boolean;
  redirectTo?: string;
};

type CallerProfile = {
  id: string;
  company_id: string | null;
  is_super_admin: boolean;
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

function forbiddenResponse() {
  return jsonResponse({ error: "Forbidden" }, 403);
}

async function callerCanManageUsers(
  supabaseUser: ReturnType<typeof createClient>,
): Promise<boolean> {
  const { data, error } = await supabaseUser.rpc("user_has_permission", {
    p_code: "users.edit",
  });

  if (error) {
    console.error("user_has_permission(users.edit) failed", error.message);
    return false;
  }

  return data === true;
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
    console.error("Unable to load caller profile", error.message);
    return null;
  }

  return (data as CallerProfile | null) ?? null;
}

async function loadCompanyTenantRoleCount(
  supabaseAdmin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("roles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  if (error) {
    console.error("Unable to count company roles", error.message);
    return 0;
  }

  return count ?? 0;
}

async function loadRole(
  supabaseAdmin: ReturnType<typeof createClient>,
  roleId: string,
): Promise<ProvisionRole | null> {
  const { data, error } = await supabaseAdmin
    .from("roles")
    .select("id, company_id, is_system, role_type")
    .eq("id", roleId)
    .maybeSingle();

  if (error) {
    console.error("Unable to load role", error.message);
    return null;
  }

  return (data as ProvisionRole | null) ?? null;
}

async function loadTargetProfileByEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
): Promise<ProvisionTargetProfile | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, company_id, is_super_admin")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("Unable to load target profile", error.message);
    return null;
  }

  return (data as ProvisionTargetProfile | null) ?? null;
}

async function rejectProvisionRequest(
  supabaseAdmin: ReturnType<typeof createClient>,
  audit: {
    callerUserId: string;
    callerCompanyId: string | null;
    requestedCompanyId: string | null;
    requestedRoleId: string | null;
    reason: string;
  },
) {
  await writeProvisionRejectionAudit(supabaseAdmin, audit);
  return forbiddenResponse();
}

async function assignUserRole(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  roleId: string,
) {
  const { error } = await supabaseAdmin.rpc("replace_user_role", {
    p_user_id: userId,
    p_role_id: roleId,
  });

  if (error) {
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse({ error: "Server auth configuration is incomplete." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const payload = (await req.json()) as ProvisionUserPayload;
    const email = payload.email?.trim().toLowerCase() ?? "";
    const fullName = payload.fullName?.trim() ?? "";
    const requestedCompanyId = payload.companyId ?? null;
    const requestedRoleId = payload.roleId ?? null;
    const isActive = payload.isActive ?? true;
    const redirectTo = payload.redirectTo?.trim() ?? "";

    if (!email || !fullName || !requestedCompanyId || !requestedRoleId || !redirectTo) {
      return jsonResponse({ error: "Missing required fields." }, 400);
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user: caller },
      error: callerError,
    } = await supabaseUser.auth.getUser();

    if (callerError || !caller) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const hasUsersEdit = await callerCanManageUsers(supabaseUser);
    const callerProfile = await loadCallerProfile(supabaseAdmin, caller.id);

    if (!callerProfile) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const role = await loadRole(supabaseAdmin, requestedRoleId);
    const existingTargetProfile = await loadTargetProfileByEmail(supabaseAdmin, email);
    const roleCountCompanyId = callerProfile.is_super_admin
      ? requestedCompanyId
      : callerProfile.company_id;
    const companyTenantRoleCount = roleCountCompanyId
      ? await loadCompanyTenantRoleCount(supabaseAdmin, roleCountCompanyId)
      : 0;

    const validation = validateProvisionRequest({
      callerUserId: caller.id,
      callerCompanyId: callerProfile.company_id,
      isSuperAdmin: callerProfile.is_super_admin === true,
      hasUsersEdit,
      requestedCompanyId,
      requestedRoleId,
      role,
      existingTargetProfile,
      companyTenantRoleCount,
    });

    if (!validation.ok) {
      return rejectProvisionRequest(supabaseAdmin, {
        callerUserId: caller.id,
        callerCompanyId: callerProfile.company_id,
        requestedCompanyId,
        requestedRoleId,
        reason: validation.auditReason,
      });
    }

    const effectiveCompanyId = validation.effectiveCompanyId;

    if (existingTargetProfile) {
      return jsonResponse({ error: "User already exists", code: "email_exists" }, 409);
    }

    const inviteResult = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: fullName },
    });

    if (inviteResult.error || !inviteResult.data.user) {
      return jsonResponse(
        { error: inviteResult.error?.message ?? "Unable to invite user." },
        400,
      );
    }

    const userId = inviteResult.data.user.id;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: fullName,
        company_id: effectiveCompanyId,
        is_active: isActive,
        is_super_admin: false,
      })
      .eq("id", userId);

    if (profileError) {
      return jsonResponse({ error: profileError.message }, 500);
    }

    await assignUserRole(supabaseAdmin, userId, requestedRoleId);

    return jsonResponse({ ok: true, userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return jsonResponse({ error: message }, 500);
  }
});
