import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiEmployeeDbRow,
  AiEmployeeInsert,
  AiEmployeeListFilter,
  AiEmployeeUpdate,
} from "@/lib/ai-employees/types";

const PAGE_SIZE = 25;

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function readUuidArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export class AiEmployeeRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByCompany(companyId: string, filter: AiEmployeeListFilter = {}): Promise<AiEmployeeDbRow[]> {
    let query = this.client
      .from("ai_employees")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (filter.status && filter.status !== "all") {
      query = query.eq("status", filter.status);
    }
    if (filter.department && filter.department !== "all") {
      query = query.eq("department", filter.department);
    }
    if (filter.provider && filter.provider !== "all") {
      query = query.eq("provider", filter.provider);
    }
    if (filter.ownerId && filter.ownerId !== "all") {
      query = query.eq("owner_id", filter.ownerId);
    }
    if (filter.tags && filter.tags.length > 0) {
      query = query.contains("tags", filter.tags);
    }
    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      query = query.or(
        `name.ilike.${term},display_name.ilike.${term},description.ilike.${term},department.ilike.${term}`,
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as AiEmployeeDbRow[];
  }

  async listPage(
    companyId: string,
    filter: AiEmployeeListFilter = {},
    cursor?: string | null,
  ): Promise<{ items: AiEmployeeDbRow[]; nextCursor: string | null }> {
    let query = this.client
      .from("ai_employees")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (filter.status && filter.status !== "all") {
      query = query.eq("status", filter.status);
    }
    if (filter.department && filter.department !== "all") {
      query = query.eq("department", filter.department);
    }
    if (filter.provider && filter.provider !== "all") {
      query = query.eq("provider", filter.provider);
    }
    if (filter.ownerId && filter.ownerId !== "all") {
      query = query.eq("owner_id", filter.ownerId);
    }
    if (filter.tags && filter.tags.length > 0) {
      query = query.contains("tags", filter.tags);
    }
    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      query = query.or(
        `name.ilike.${term},display_name.ilike.${term},description.ilike.${term},department.ilike.${term}`,
      );
    }
    if (cursor) {
      query = query.lt("updated_at", cursor);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as AiEmployeeDbRow[];
    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.updated_at ?? null : null;
    return { items, nextCursor };
  }

  async getById(id: string, companyId: string): Promise<AiEmployeeDbRow | null> {
    const { data, error } = await this.client
      .from("ai_employees")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as AiEmployeeDbRow | null) ?? null;
  }

  async getByIdIncludingDeleted(id: string, companyId: string): Promise<AiEmployeeDbRow | null> {
    const { data, error } = await this.client
      .from("ai_employees")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as AiEmployeeDbRow | null) ?? null;
  }

  async getByName(companyId: string, name: string, excludeId?: string): Promise<AiEmployeeDbRow | null> {
    let query = this.client
      .from("ai_employees")
      .select("*")
      .eq("company_id", companyId)
      .ilike("name", name)
      .is("deleted_at", null);

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    return (data as AiEmployeeDbRow | null) ?? null;
  }

  async create(values: AiEmployeeInsert): Promise<AiEmployeeDbRow> {
    const { data, error } = await this.client.from("ai_employees").insert(values).select("*").single();
    if (error) throw new Error(error.message);
    return data as AiEmployeeDbRow;
  }

  async update(id: string, companyId: string, values: AiEmployeeUpdate): Promise<AiEmployeeDbRow> {
    const { data, error } = await this.client
      .from("ai_employees")
      .update(values)
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return data as AiEmployeeDbRow;
  }

  async softDelete(id: string, companyId: string, actorId?: string | null): Promise<void> {
    const { error } = await this.client
      .from("ai_employees")
      .update({
        status: "archived",
        updated_by: actorId ?? null,
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
  }

  async restoreArchived(id: string, companyId: string, actorId?: string | null): Promise<AiEmployeeDbRow> {
    const { data, error } = await this.client
      .from("ai_employees")
      .update({
        deleted_at: null,
        status: "draft",
        updated_by: actorId ?? null,
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return data as AiEmployeeDbRow;
  }

  async listOwnerProfiles(
    companyId: string,
    ownerIds: string[],
  ): Promise<Map<string, string>> {
    if (ownerIds.length === 0) return new Map();

    const { data, error } = await this.client
      .from("profiles")
      .select("id, full_name, email")
      .eq("company_id", companyId)
      .in("id", ownerIds);

    if (error) throw new Error(error.message);

    const map = new Map<string, string>();
    for (const row of data ?? []) {
      const label = (row.full_name as string | null)?.trim() || (row.email as string | null) || (row.id as string);
      map.set(row.id as string, label);
    }
    return map;
  }

  async listEnabledTools(): Promise<
    Array<{ key: string; display_name: string; category: string; required_permissions: unknown }>
  > {
    const { data, error } = await this.client
      .from("tool_definitions")
      .select("key, display_name, category, required_permissions")
      .eq("is_enabled", true)
      .order("display_name");

    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      key: string;
      display_name: string;
      category: string;
      required_permissions: unknown;
    }>;
  }

  async listKnowledgeSources(companyId: string): Promise<Array<{ id: string; name: string }>> {
    const { data, error } = await this.client
      .from("knowledge_sources")
      .select("id, display_name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("display_name");

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.display_name as string,
    }));
  }

  async listKnowledgeSourceDetails(
    companyId: string,
    sourceIds?: string[],
  ): Promise<Array<{ id: string; name: string; sourceType: string | null; documentCount: number }>> {
    let query = this.client
      .from("knowledge_sources")
      .select("id, display_name, source_type")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("display_name");

    if (sourceIds && sourceIds.length > 0) {
      query = query.in("id", sourceIds);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const counts = await Promise.all(
      rows.map(async (row) => {
        const { count, error: countError } = await this.client
          .from("knowledge_documents")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("source_id", row.id as string)
          .is("deleted_at", null);
        if (countError) throw new Error(countError.message);
        return count ?? 0;
      }),
    );

    return rows.map((row, index) => ({
      id: row.id as string,
      name: row.display_name as string,
      sourceType: (row.source_type as string | null) ?? null,
      documentCount: counts[index] ?? 0,
    }));
  }

  normalizeRow(row: AiEmployeeDbRow): AiEmployeeDbRow {
    return {
      ...row,
      knowledge_source_ids: readStringArray(row.knowledge_source_ids),
      allowed_tool_keys: readStringArray(row.allowed_tool_keys),
      allowed_skill_ids: readUuidArray(row.allowed_skill_ids),
      tags: readStringArray(row.tags),
      prompt_version_label: row.prompt_version_label ?? "v1",
      runtime_configuration: row.runtime_configuration ?? {},
    };
  }
}
