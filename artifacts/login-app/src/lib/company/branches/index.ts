import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  BranchRepository,
  UserBranchAssignmentRepository,
} from "@/lib/company/branches/repositories";
import {
  BranchManagementService,
  ServiceBranchAvailabilityService,
  UserBranchAssignmentService,
} from "@/lib/company/branches/services";
import {
  memoizeSchedulingFactory,
  WA_REQUEST_CACHE_NS,
} from "@/lib/scheduling/request-scoped-memo";
import { wxRecordDependencyConstruction } from "@workspace/automation-platform";

export function createBranchServices(client: SupabaseClient = supabase) {
  return memoizeSchedulingFactory(WA_REQUEST_CACHE_NS.branchServices, client, () => {
    wxRecordDependencyConstruction("createBranchServices");
    const branchRepo = new BranchRepository(client);
    const assignmentRepo = new UserBranchAssignmentRepository(client);

    return {
      branches: new BranchManagementService(branchRepo),
      userAssignments: new UserBranchAssignmentService(assignmentRepo, branchRepo),
      serviceAvailability: new ServiceBranchAvailabilityService(client),
      repositories: {
        branches: branchRepo,
        assignments: assignmentRepo,
      },
    };
  });
}

let cached: ReturnType<typeof createBranchServices> | null = null;

export function getBranchServices(client: SupabaseClient = supabase) {
  if (!cached) {
    cached = createBranchServices(client);
  }
  return cached;
}

export {
  BranchRepository,
  UserBranchAssignmentRepository,
  BranchManagementService,
  UserBranchAssignmentService,
  ServiceBranchAvailabilityService,
};
