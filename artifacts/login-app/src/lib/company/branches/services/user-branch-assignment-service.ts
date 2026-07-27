import type { BranchRepository } from "@/lib/company/branches/repositories/branch-repository";
import type { UserBranchAssignmentRepository } from "@/lib/company/branches/repositories/user-branch-assignment-repository";
import type { BranchRecord } from "@/lib/company/branches/types";

export class UserBranchAssignmentService {
  constructor(
    private readonly assignmentRepo: UserBranchAssignmentRepository,
    private readonly branchRepo: BranchRepository,
  ) {}

  listBranchIdsForUser(userId: string, companyId: string): Promise<string[]> {
    return this.assignmentRepo.listBranchIdsByUser(userId, companyId);
  }

  getAssignmentMap(companyId: string): Promise<Record<string, string[]>> {
    return this.assignmentRepo.getAssignmentMap(companyId);
  }

  async syncUserBranches(userId: string, companyId: string, branchIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(branchIds)];
    if (uniqueIds.length === 0) {
      await this.assignmentRepo.replaceForUser(userId, companyId, []);
      return;
    }

    const branches = await this.branchRepo.listByCompany(companyId);
    const validIds = new Set(branches.map((b) => b.id));
    const filtered = uniqueIds.filter((id) => validIds.has(id));
    await this.assignmentRepo.replaceForUser(userId, companyId, filtered);
  }

  async resolveBranchesForUser(
    userId: string,
    companyId: string,
  ): Promise<BranchRecord[]> {
    const [allBranches, assignedIds] = await Promise.all([
      this.branchRepo.listByCompany(companyId),
      this.assignmentRepo.listBranchIdsByUser(userId, companyId),
    ]);

    if (assignedIds.length === 0) {
      return allBranches.filter((b) => b.status === "active");
    }

    const assigned = new Set(assignedIds);
    return allBranches.filter((b) => assigned.has(b.id) && b.status === "active");
  }
}
