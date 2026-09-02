import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type ResetAdminPasswordAudit = {
  callerUserId: string;
  callerCompanyId: string | null;
  targetCompanyId: string;
  targetAdminUserId: string | null;
  result: "success" | "failure";
  reason?: string;
};

export async function writeResetAdminPasswordAudit(
  supabaseAdmin: ReturnType<typeof createClient>,
  audit: ResetAdminPasswordAudit,
): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    user_id: audit.callerUserId,
    company_id: audit.targetCompanyId,
    action: "UPDATE",
    entity: "admin_password_reset",
    entity_id: audit.targetAdminUserId,
    metadata: {
      action: "admin_password_reset",
      result: audit.result,
      reason: audit.reason ?? null,
      actor_user_id: audit.callerUserId,
      actor_company_id: audit.callerCompanyId,
      target_company_id: audit.targetCompanyId,
      target_admin_user_id: audit.targetAdminUserId,
      timestamp: new Date().toISOString(),
      // Intentionally NEVER includes password, hash, tokens, or confirmation.
    },
  });

  if (error) {
    console.error("reset-company-admin-password audit failed", error.message);
  }
}
