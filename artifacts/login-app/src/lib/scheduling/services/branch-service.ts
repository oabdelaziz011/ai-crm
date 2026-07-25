import type { SchedulingBranchRepository } from "@/lib/scheduling/repositories/resource-repository";
import type { Branch } from "@/lib/scheduling/types";

export class BranchService {
  constructor(private readonly repository: SchedulingBranchRepository) {}

  list(companyId: string): Promise<Branch[]> {
    return this.repository.listByCompany(companyId);
  }
}
