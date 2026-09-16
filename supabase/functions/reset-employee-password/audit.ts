import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type ResetEmployeePasswordAudit = {
  callerUserId: string;
  callerCompanyId: string | null;
  targetCompanyId: string | null;
  targetUserId: string | null;
  result: "success" | "failure";
  reason?: string;
};

export async function writeResetEmployeePasswordAudit(
  supabaseAdmin: ReturnType<typeof createClient>,
  audit: ResetEmployeePasswordAudit,
): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    user_id: audit.callerUserId,
    company_id: audit.targetCompanyId,
    action: "UPDATE",
    entity: "employee_password_reset",
    entity_id: audit.targetUserId,
    metadata: {
      // Intentionally NEVER includes password.
      action: "employee_password_reset",
      result: audit.result,
      reason: audit.reason ?? null,
      actor_user_id: audit.callerUserId,
      actor_company_id: audit.callerCompanyId,
      target_company_id: audit.targetCompanyId,
      target_user_id: audit.targetUserId,
      timestamp: new Date().toISOString(),
    },
  });

  if (error) {
    console.error("reset-employee-password audit failed", error.message);
  }
}
