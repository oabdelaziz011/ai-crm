import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type ProvisionRejectionAudit = {
  callerUserId: string;
  callerCompanyId: string | null;
  requestedCompanyId: string | null;
  requestedRoleId: string | null;
  reason: string;
};

export async function writeProvisionRejectionAudit(
  supabaseAdmin: ReturnType<typeof createClient>,
  audit: ProvisionRejectionAudit,
): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    user_id: audit.callerUserId,
    company_id: audit.callerCompanyId,
    action: "CREATE",
    entity: "provision_user_rejection",
    entity_id: audit.requestedRoleId,
    metadata: {
      reason: audit.reason,
      requested_company_id: audit.requestedCompanyId,
      requested_role_id: audit.requestedRoleId,
      caller_company_id: audit.callerCompanyId,
      timestamp: new Date().toISOString(),
    },
  });

  if (error) {
    console.error("provision-user rejection audit failed", error.message);
  }
}
