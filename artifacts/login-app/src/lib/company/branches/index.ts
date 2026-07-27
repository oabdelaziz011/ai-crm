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

export function createBranchServices(client: SupabaseClient = supabase) {
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
