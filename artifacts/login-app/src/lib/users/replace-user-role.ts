import {
  ROLE_ASSIGNMENT_REJECTION,
  RoleAssignmentError,
} from "@/lib/users/role-company-validation";
import { supabase } from "@/lib/supabase";

const LAST_COMPANY_ADMIN_MESSAGE =
  "Tenant must retain at least one active Company Administrator";

export function mapReplaceUserRoleRpcError(message: string): RoleAssignmentError | null {
  if (message.includes(LAST_COMPANY_ADMIN_MESSAGE)) {
    return new RoleAssignmentError(
      ROLE_ASSIGNMENT_REJECTION.LAST_COMPANY_ADMIN,
      "This change would remove the last active Company Administrator for the tenant.",
    );
  }

  if (message.includes("Role is not assignable to the user company")) {
    return new RoleAssignmentError(
      ROLE_ASSIGNMENT_REJECTION.ROLE_TENANT_MISMATCH,
      "The selected role does not belong to the target company.",
    );
  }

  if (message.includes("role_delegation_denied") || message.includes("permission_delegation_denied")) {
    return new RoleAssignmentError(
      ROLE_ASSIGNMENT_REJECTION.FORBIDDEN,
      "You cannot assign a role that includes permissions you do not have.",
    );
  }

  if (message.includes("Cross tenant access denied") || message === "Forbidden") {
    return new RoleAssignmentError(
      ROLE_ASSIGNMENT_REJECTION.FORBIDDEN,
      "You do not have permission to change this user's role.",
    );
  }

  return null;
}

export async function replaceUserRole(userId: string, roleId: string): Promise<void> {
  const { error } = await supabase.rpc("replace_user_role", {
    p_user_id: userId,
    p_role_id: roleId,
  });

  if (error) {
    const mapped = mapReplaceUserRoleRpcError(error.message);
    throw mapped ?? new Error(error.message);
  }
}

export async function replaceUserRoles(userId: string, roleIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("replace_user_roles", {
    p_user_id: userId,
    p_role_ids: roleIds,
  });

  if (error) {
    const mapped = mapReplaceUserRoleRpcError(error.message);
    throw mapped ?? new Error(error.message);
  }
}
