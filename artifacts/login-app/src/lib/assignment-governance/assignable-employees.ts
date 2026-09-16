import type { AssignableEmployee, AssignmentResource } from "@workspace/assignment-governance";
import {
  AssignmentGovernanceService,
  createSupabaseAssignmentGovernanceDataPort,
} from "@workspace/assignment-governance";
import { supabase } from "@/lib/supabase";

/**
 * Canonical assignable-employee read path for UI.
 * Delegates entirely to AssignmentGovernanceService — no client-side role/dept rules.
 */
export async function listAssignableEmployeesForActor(input: {
  actorUserId: string;
  resource?: AssignmentResource;
  searchQuery?: string;
}): Promise<AssignableEmployee[]> {
  const actorUserId = input.actorUserId.trim();
  if (!actorUserId) return [];

  const service = new AssignmentGovernanceService({
    port: createSupabaseAssignmentGovernanceDataPort(supabase),
  });

  return service.getAssignableEmployees({
    actorUserId,
    resource: input.resource,
    searchQuery: input.searchQuery,
  });
}

export {
  filterAssignableEmployeesBySearch,
  formatAssignableDepartmentLabel,
  formatAssignableEmployeeLabel,
} from "./assignable-employee-labels.js";
