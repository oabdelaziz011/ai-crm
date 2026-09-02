import type { AiEmployeeRepository } from "@/lib/ai-employees/repositories";
import { mapAiEmployeeRow, mapAiEmployeeRows } from "@/lib/ai-employees/selectors";
import type {
  AiEmployeeFormValues,
  AiEmployeeListFilter,
  AiEmployeeListPage,
  AiEmployeeRecord,
  KnowledgeSourceOption,
  ToolDefinitionOption,
} from "@/lib/ai-employees/types";
import {
  formValuesToInsert,
  formValuesToUpdate,
  normalizeAiEmployeeName,
  resolveAiEmployeeInternalName,
} from "@/lib/ai-employees/validators";
import { aiEmployeesTrace } from "@/lib/ai-employees/debug/ai-employees-trace";
import { assertAiEmployeeSafeToDelete, isActiveAiEmployeeStatus } from "./assert-ai-employee-safe-to-archive";
import { AiEmployeeRegistryError } from "./ai-employee-errors";

export class AiEmployeeRegistryService {
  constructor(private readonly repository: AiEmployeeRepository) {}

  async list(companyId: string, filter: AiEmployeeListFilter = {}): Promise<AiEmployeeRecord[]> {
    console.log("[AI_EMPLOYEES_TRACE AiEmployeeRegistryService.list]", { companyId, filter });
    aiEmployeesTrace("AiEmployeeRegistryService.list", { companyId, filter });
    const rows = await this.repository.listByCompany(companyId, filter);
    const ownerIds = [...new Set(rows.map((row) => row.owner_id).filter(Boolean))] as string[];
    const ownerLabels = await this.repository.listOwnerProfiles(companyId, ownerIds);
    const mapped = mapAiEmployeeRows(rows, ownerLabels);
    console.log("[AI_EMPLOYEES_TRACE AiEmployeeRegistryService.list result]", {
      rowCount: rows.length,
      mappedCount: mapped.length,
    });
    aiEmployeesTrace("AiEmployeeRegistryService.list result", {
      rowCount: rows.length,
      mappedCount: mapped.length,
    });
    return mapped;
  }

  async listPage(
    companyId: string,
    filter: AiEmployeeListFilter = {},
    cursor?: string | null,
  ): Promise<AiEmployeeListPage> {
    const { items, nextCursor } = await this.repository.listPage(companyId, filter, cursor);
    const ownerIds = [...new Set(items.map((row) => row.owner_id).filter(Boolean))] as string[];
    const ownerLabels = await this.repository.listOwnerProfiles(companyId, ownerIds);
    return {
      items: mapAiEmployeeRows(items, ownerLabels),
      nextCursor,
      hasMore: nextCursor != null,
    };
  }

  async getById(id: string, companyId: string): Promise<AiEmployeeRecord | null> {
    const row = await this.repository.getById(id, companyId);
    if (!row) return null;
    const ownerLabels = row.owner_id
      ? await this.repository.listOwnerProfiles(companyId, [row.owner_id])
      : new Map<string, string>();
    return mapAiEmployeeRow(row, row.owner_id ? ownerLabels.get(row.owner_id) ?? null : null);
  }

  async create(
    companyId: string,
    values: AiEmployeeFormValues,
    actorId?: string | null,
  ): Promise<AiEmployeeRecord> {
    await this.assertUniqueName(
      companyId,
      resolveAiEmployeeInternalName(values.name, values.displayName),
    );
    const knowledgeNames = await this.resolveKnowledgeNames(companyId, values.knowledgeSourceIds);
    const row = await this.repository.create(formValuesToInsert(companyId, values, knowledgeNames, actorId));
    return mapAiEmployeeRow(row);
  }

  async update(
    id: string,
    companyId: string,
    values: AiEmployeeFormValues,
    actorId?: string | null,
  ): Promise<AiEmployeeRecord> {
    const existing = await this.repository.getById(id, companyId);
    if (!existing) {
      throw new AiEmployeeRegistryError("AI Employee not found", "not_found");
    }
    await this.assertUniqueName(
      companyId,
      resolveAiEmployeeInternalName(values.name, values.displayName),
      id,
    );
    const knowledgeNames = await this.resolveKnowledgeNames(companyId, values.knowledgeSourceIds);
    const row = await this.repository.update(id, companyId, formValuesToUpdate(values, knowledgeNames, actorId));
    const ownerLabels = row.owner_id
      ? await this.repository.listOwnerProfiles(companyId, [row.owner_id])
      : new Map<string, string>();
    return mapAiEmployeeRow(row, row.owner_id ? ownerLabels.get(row.owner_id) ?? null : null);
  }

  async softDelete(id: string, companyId: string, actorId?: string | null): Promise<void> {
    const existing = await this.repository.getById(id, companyId);
    if (!existing) {
      throw new AiEmployeeRegistryError("AI Employee not found", "not_found");
    }
    const safety = await assertAiEmployeeSafeToDelete(this.repository.client, companyId, id);
    if (!safety.canDelete) {
      if (safety.alreadyArchived) {
        throw new AiEmployeeRegistryError(
          "This AI Employee is already archived. Restore it from Lifecycle if you need it again.",
          "already_archived",
          safety,
        );
      }
      throw new AiEmployeeRegistryError(
        safety.isActiveEmployee
          ? "This AI Employee is active and must be disabled before it can be deleted."
          : "Cannot delete this AI Employee.",
        "delete_blocked",
        safety,
      );
    }
    // Race: re-read lifecycle status immediately before mutation.
    const freshRow = await this.repository.getById(id, companyId);
    if (!freshRow) {
      throw new AiEmployeeRegistryError("AI Employee not found", "not_found");
    }
    if (isActiveAiEmployeeStatus(freshRow.status)) {
      const freshSafety = await assertAiEmployeeSafeToDelete(this.repository.client, companyId, id);
      throw new AiEmployeeRegistryError(
        "This AI Employee is active and must be disabled before it can be deleted.",
        "delete_blocked",
        freshSafety,
      );
    }
    await this.repository.softDelete(id, companyId, actorId);
  }

  async listToolOptions(): Promise<ToolDefinitionOption[]> {
    const tools = await this.repository.listEnabledTools();
    return tools.map((tool) => ({
      key: tool.key,
      displayName: tool.display_name,
      category: tool.category,
    }));
  }

  async listKnowledgeOptions(companyId: string): Promise<KnowledgeSourceOption[]> {
    return this.repository.listKnowledgeSources(companyId);
  }

  private async assertUniqueName(companyId: string, name: string, excludeId?: string): Promise<void> {
    const normalized = normalizeAiEmployeeName(name);
    if (!normalized) {
      throw new AiEmployeeRegistryError("Internal name is required", "validation");
    }
    const existing = await this.repository.getByName(companyId, normalized, excludeId);
    if (existing) {
      throw new AiEmployeeRegistryError("An AI Employee with this name already exists", "duplicate_name");
    }
  }

  private async resolveKnowledgeNames(companyId: string, sourceIds: string[]): Promise<string[]> {
    if (sourceIds.length === 0) return [];
    const sources = await this.repository.listKnowledgeSources(companyId);
    const byId = new Map(sources.map((source) => [source.id, source.name]));
    return sourceIds.map((id) => byId.get(id) ?? id);
  }
}
