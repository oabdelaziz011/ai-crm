/**
 * Supabase-backed ports for email conversation department ownership resolution.
 * Used at inbound first-create only. Does not mutate conversations.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveEmailConversationDepartmentOwnership,
  type EmailConversationDepartmentOwnershipPorts,
} from "@workspace/ai-intent-engine";

export function createSupabaseEmailConversationDepartmentOwnershipPorts(
  client: SupabaseClient,
): EmailConversationDepartmentOwnershipPorts {
  return {
    async getDepartment({ companyId, departmentId }) {
      const { data, error } = await client
        .from("organization_departments")
        .select("id, company_id, is_active")
        .eq("id", departmentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const rowCompanyId = data.company_id ? String(data.company_id) : "";
      if (rowCompanyId !== companyId) return null;
      return {
        id: String(data.id),
        companyId: rowCompanyId,
        isActive: data.is_active !== false,
      };
    },

    async getEmployee({ companyId, userId }) {
      const { data, error } = await client
        .from("profiles")
        .select("id, company_id, department_id")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        userId: String(data.id),
        companyId: data.company_id ? String(data.company_id) : null,
        departmentId: data.department_id ? String(data.department_id) : null,
      };
    },

    async getQueue({ companyId, queueId }) {
      const { data, error } = await client
        .from("handoff_queues")
        .select("id, company_id, department_id, is_active, deleted_at")
        .eq("id", queueId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      if (data.deleted_at) return null;
      const rowCompanyId = data.company_id ? String(data.company_id) : "";
      if (rowCompanyId !== companyId) return null;
      return {
        id: String(data.id),
        companyId: rowCompanyId,
        departmentId: data.department_id ? String(data.department_id) : null,
        isActive: data.is_active !== false,
      };
    },
  };
}

export function createResolveEmailDepartmentOwnership(
  client: SupabaseClient,
): (input: {
  companyId: string;
  targetType?: string | null;
  targetId?: string | null;
}) => Promise<string | null> {
  const ports = createSupabaseEmailConversationDepartmentOwnershipPorts(client);
  return async (input) => {
    const result = await resolveEmailConversationDepartmentOwnership({
      companyId: input.companyId,
      decision:
        input.targetType || input.targetId
          ? { targetType: input.targetType ?? null, targetId: input.targetId ?? null }
          : null,
      ports,
    });
    return result.departmentId;
  };
}
