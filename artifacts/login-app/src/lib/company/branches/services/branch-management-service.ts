import type { BranchRepository } from "@/lib/company/branches/repositories/branch-repository";
import type {
  BranchFormValues,
  BranchListFilter,
  BranchListPage,
  BranchRecord,
  BranchStats,
  BranchWithStats,
} from "@/lib/company/branches/types";
import {
  formValuesToInsert,
  formValuesToUpdate,
  normalizeBranchCode,
} from "@/lib/company/branches/validators";
import { BranchManagementError } from "./branch-errors";

export class BranchManagementService {
  constructor(private readonly repository: BranchRepository) {}

  list(companyId: string): Promise<BranchRecord[]> {
    return this.repository.listByCompany(companyId);
  }

  async listWithStats(companyId: string, filter: BranchListFilter = {}): Promise<BranchWithStats[]> {
    const { items } = await this.repository.listPage(companyId, filter);
    return this.repository.attachStats(companyId, items);
  }

  async listPage(companyId: string, filter: BranchListFilter = {}, cursor?: string | null): Promise<BranchListPage> {
    const { items, nextCursor } = await this.repository.listPage(companyId, filter, cursor);
    const withStats = await this.repository.attachStats(companyId, items);
    return {
      items: withStats,
      nextCursor,
      hasMore: nextCursor != null,
    };
  }

  getById(id: string, companyId: string): Promise<BranchRecord | null> {
    return this.repository.getById(id, companyId);
  }

  async getByIdWithStats(id: string, companyId: string): Promise<BranchWithStats | null> {
    const branch = await this.repository.getById(id, companyId);
    if (!branch) return null;
    const [withStats] = await this.repository.attachStats(companyId, [branch]);
    return withStats ?? null;
  }

  getCompanyStats(companyId: string): Promise<BranchStats> {
    return this.repository.getCompanyStats(companyId);
  }

  async create(
    companyId: string,
    values: BranchFormValues,
    actorId?: string | null,
  ): Promise<BranchRecord> {
    await this.assertUniqueCode(companyId, values.code);

    if (values.is_primary) {
      await this.repository.clearPrimaryForCompany(companyId);
    }

    return this.repository.create(formValuesToInsert(companyId, values, actorId));
  }

  async update(
    id: string,
    companyId: string,
    values: BranchFormValues,
    actorId?: string | null,
  ): Promise<BranchRecord> {
    const existing = await this.repository.getById(id, companyId);
    if (!existing) {
      throw new BranchManagementError("Branch not found", "not_found");
    }

    await this.assertUniqueCode(companyId, values.code, id);

    if (values.is_primary) {
      await this.repository.clearPrimaryExcept(companyId, id);
    }

    return this.repository.update(id, companyId, formValuesToUpdate(values, actorId));
  }

  async deactivate(id: string, companyId: string): Promise<BranchRecord> {
    const existing = await this.repository.getById(id, companyId);
    if (!existing) {
      throw new BranchManagementError("Branch not found", "not_found");
    }

    return this.repository.update(id, companyId, { status: "inactive", is_primary: false });
  }

  async delete(id: string, companyId: string): Promise<void> {
    const existing = await this.repository.getById(id, companyId);
    if (!existing) {
      throw new BranchManagementError("Branch not found", "not_found");
    }

    const deps = await this.repository.countDependencies(id, companyId);
    if (deps.users > 0 || deps.resources > 0 || deps.bookings > 0) {
      throw new BranchManagementError(
        "Cannot delete branch with assigned users, resources, or bookings. Deactivate instead.",
        "has_dependencies",
      );
    }

    await this.repository.softDelete(id, companyId);
  }

  private async assertUniqueCode(companyId: string, code: string, excludeId?: string) {
    const normalized = normalizeBranchCode(code);
    const existing = await this.repository.getByCode(companyId, normalized, excludeId);
    if (existing) {
      throw new BranchManagementError(
        "Branch code must be unique within the company",
        "duplicate_code",
      );
    }
  }
}
