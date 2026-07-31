import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiSkillChangeEventType,
  AiSkillDbRow,
  AiSkillDeploymentRecord,
  AiSkillListFilter,
  AiSkillVersionRecord,
  AiSkillVersionSnapshot,
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

type VersionRow = {
  id: string;
  company_id: string;
  skill_id: string;
  version_number: number;
  status: AiSkillVersionRecord["status"];
  snapshot: AiSkillVersionSnapshot;
  publish_notes: string;
  created_at: string;
  created_by: string | null;
  published_at: string;
  published_by: string | null;
};

type DeploymentRow = {
  id: string;
  company_id: string;
  skill_id: string;
  version_id: string;
  version_number: number;
  status: AiSkillDeploymentRecord["status"];
  publish_notes: string;
  published_at: string;
  published_by: string | null;
};

function mapVersion(row: VersionRow): AiSkillVersionRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    skillId: row.skill_id,
    versionNumber: row.version_number,
    status: row.status,
    snapshot: row.snapshot,
    publishNotes: row.publish_notes,
    createdAt: row.created_at,
    createdBy: row.created_by,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
  };
}

function mapDeployment(row: DeploymentRow): AiSkillDeploymentRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    skillId: row.skill_id,
    versionId: row.version_id,
    versionNumber: row.version_number,
    status: row.status,
    publishNotes: row.publish_notes,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
  };
}

export class AiEmployeeSkillRepository {
  constructor(private readonly client: SupabaseClient) {}

  normalizeRow(row: AiSkillDbRow): AiSkillDbRow {
    return {
      ...row,
      tags: readStringArray(row.tags),
      tool_keys: readStringArray(row.tool_keys),
      required_permissions: readStringArray(row.required_permissions),
      required_knowledge_ids: readUuidArray(row.required_knowledge_ids),
      runtime_recommendations: row.runtime_recommendations ?? {},
      documentation: row.documentation ?? {},
    };
  }

  async listByCompany(companyId: string, filter: AiSkillListFilter = {}): Promise<AiSkillDbRow[]> {
    let query = this.client
      .from("ai_skills")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (filter.status && filter.status !== "all") {
      query = query.eq("status", filter.status);
    }
    if (filter.category && filter.category !== "all") {
      query = query.eq("category", filter.category);
    }
    if (filter.tags && filter.tags.length > 0) {
      query = query.contains("tags", filter.tags);
    }
    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      query = query.or(`name.ilike.${term},display_name.ilike.${term},description.ilike.${term},key.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.normalizeRow(row as AiSkillDbRow));
  }

  async listPage(
    companyId: string,
    filter: AiSkillListFilter = {},
    cursor?: string | null,
  ): Promise<{ items: AiSkillDbRow[]; nextCursor: string | null }> {
    let query = this.client
      .from("ai_skills")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (filter.status && filter.status !== "all") {
      query = query.eq("status", filter.status);
    }
    if (filter.category && filter.category !== "all") {
      query = query.eq("category", filter.category);
    }
    if (filter.tags && filter.tags.length > 0) {
      query = query.contains("tags", filter.tags);
    }
    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      query = query.or(`name.ilike.${term},display_name.ilike.${term},description.ilike.${term},key.ilike.${term}`);
    }
    if (cursor) {
      query = query.lt("updated_at", cursor);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []).map((row) => this.normalizeRow(row as AiSkillDbRow));
    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.updated_at ?? null : null;
    return { items, nextCursor };
  }

  async getById(id: string, companyId: string): Promise<AiSkillDbRow | null> {
    const { data, error } = await this.client
      .from("ai_skills")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? this.normalizeRow(data as AiSkillDbRow) : null;
  }

  async getByIds(ids: string[], companyId: string): Promise<AiSkillDbRow[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.client
      .from("ai_skills")
      .select("*")
      .eq("company_id", companyId)
      .in("id", ids)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.normalizeRow(row as AiSkillDbRow));
  }

  async getByKey(companyId: string, key: string, excludeId?: string): Promise<AiSkillDbRow | null> {
    let query = this.client
      .from("ai_skills")
      .select("*")
      .eq("company_id", companyId)
      .ilike("key", key)
      .is("deleted_at", null);

    if (excludeId) query = query.neq("id", excludeId);

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.normalizeRow(data as AiSkillDbRow) : null;
  }

  async create(values: Partial<AiSkillDbRow> & Pick<AiSkillDbRow, "company_id" | "key" | "name" | "display_name">): Promise<AiSkillDbRow> {
    const { data, error } = await this.client.from("ai_skills").insert(values).select("*").single();
    if (error) throw new Error(error.message);
    return this.normalizeRow(data as AiSkillDbRow);
  }

  async update(id: string, companyId: string, values: Partial<AiSkillDbRow>): Promise<AiSkillDbRow> {
    const { data, error } = await this.client
      .from("ai_skills")
      .update(values)
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return this.normalizeRow(data as AiSkillDbRow);
  }

  async archive(id: string, companyId: string, actorId?: string | null): Promise<AiSkillDbRow> {
    return this.update(id, companyId, {
      status: "archived",
      updated_by: actorId ?? null,
    });
  }

  async restore(id: string, companyId: string, actorId?: string | null): Promise<AiSkillDbRow> {
    return this.update(id, companyId, {
      status: "draft",
      deleted_at: null,
      updated_by: actorId ?? null,
    });
  }

  async listDependencies(skillId: string, companyId: string): Promise<Array<{ id: string; skill_id: string; depends_on_skill_id: string }>> {
    const { data, error } = await this.client
      .from("ai_skill_dependencies")
      .select("id, skill_id, depends_on_skill_id")
      .eq("company_id", companyId)
      .eq("skill_id", skillId);

    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; skill_id: string; depends_on_skill_id: string }>;
  }

  async listAllDependencies(companyId: string): Promise<Array<{ id: string; skill_id: string; depends_on_skill_id: string }>> {
    const { data, error } = await this.client
      .from("ai_skill_dependencies")
      .select("id, skill_id, depends_on_skill_id")
      .eq("company_id", companyId);

    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; skill_id: string; depends_on_skill_id: string }>;
  }

  async addDependency(input: {
    companyId: string;
    skillId: string;
    dependsOnSkillId: string;
  }): Promise<void> {
    const { error } = await this.client.from("ai_skill_dependencies").insert({
      company_id: input.companyId,
      skill_id: input.skillId,
      depends_on_skill_id: input.dependsOnSkillId,
    });
    if (error) throw new Error(error.message);
  }

  async removeDependency(id: string, companyId: string): Promise<void> {
    const { error } = await this.client
      .from("ai_skill_dependencies")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
  }

  async listFavorites(companyId: string, userId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from("ai_skill_favorites")
      .select("skill_id")
      .eq("company_id", companyId)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => row.skill_id as string);
  }

  async toggleFavorite(companyId: string, skillId: string, userId: string, favorite: boolean): Promise<void> {
    if (favorite) {
      const { error } = await this.client.from("ai_skill_favorites").upsert({
        company_id: companyId,
        skill_id: skillId,
        user_id: userId,
      });
      if (error) throw new Error(error.message);
      return;
    }

    const { error } = await this.client
      .from("ai_skill_favorites")
      .delete()
      .eq("company_id", companyId)
      .eq("skill_id", skillId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }

  async countAssignments(skillId: string, companyId: string): Promise<number> {
    const { data, error } = await this.client
      .from("ai_employees")
      .select("id")
      .eq("company_id", companyId)
      .contains("allowed_skill_ids", [skillId])
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
    return (data ?? []).length;
  }

  async listEmployeesWithSkill(skillId: string, companyId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from("ai_employees")
      .select("id")
      .eq("company_id", companyId)
      .contains("allowed_skill_ids", [skillId])
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => row.id as string);
  }

  async updateEmployeeSkills(
    employeeId: string,
    companyId: string,
    skillIds: string[],
    skillsSummary: string,
    actorId?: string | null,
  ): Promise<void> {
    const { error } = await this.client
      .from("ai_employees")
      .update({
        allowed_skill_ids: skillIds,
        skills_summary: skillsSummary,
        updated_by: actorId ?? null,
      })
      .eq("id", employeeId)
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
  }

  async getNextVersionNumber(skillId: string, companyId: string): Promise<number> {
    const { data, error } = await this.client
      .from("ai_skill_versions")
      .select("version_number")
      .eq("skill_id", skillId)
      .eq("company_id", companyId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data?.version_number != null ? Number(data.version_number) + 1 : 1;
  }

  async createVersion(input: {
    companyId: string;
    skillId: string;
    versionNumber: number;
    snapshot: AiSkillVersionSnapshot;
    publishNotes: string;
    actorId?: string | null;
  }): Promise<AiSkillVersionRecord> {
    const { data, error } = await this.client
      .from("ai_skill_versions")
      .insert({
        company_id: input.companyId,
        skill_id: input.skillId,
        version_number: input.versionNumber,
        snapshot: input.snapshot,
        publish_notes: input.publishNotes,
        created_by: input.actorId ?? null,
        published_by: input.actorId ?? null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return mapVersion(data as VersionRow);
  }

  async markVersionsSuperseded(skillId: string, companyId: string, activeVersionId: string): Promise<void> {
    const { error } = await this.client
      .from("ai_skill_versions")
      .update({ status: "superseded" })
      .eq("skill_id", skillId)
      .eq("company_id", companyId)
      .neq("id", activeVersionId)
      .eq("status", "published");

    if (error) throw new Error(error.message);
  }

  async createDeployment(input: {
    companyId: string;
    skillId: string;
    versionId: string;
    versionNumber: number;
    publishNotes: string;
    actorId?: string | null;
  }): Promise<AiSkillDeploymentRecord> {
    const { error: supersedeError } = await this.client
      .from("ai_skill_deployments")
      .update({ status: "superseded" })
      .eq("skill_id", input.skillId)
      .eq("company_id", input.companyId)
      .eq("status", "active");

    if (supersedeError) throw new Error(supersedeError.message);

    const { data, error } = await this.client
      .from("ai_skill_deployments")
      .insert({
        company_id: input.companyId,
        skill_id: input.skillId,
        version_id: input.versionId,
        version_number: input.versionNumber,
        publish_notes: input.publishNotes,
        published_by: input.actorId ?? null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return mapDeployment(data as DeploymentRow);
  }

  async listVersions(skillId: string, companyId: string): Promise<AiSkillVersionRecord[]> {
    const { data, error } = await this.client
      .from("ai_skill_versions")
      .select("*")
      .eq("skill_id", skillId)
      .eq("company_id", companyId)
      .order("version_number", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapVersion(row as VersionRow));
  }

  async getVersionByNumber(skillId: string, companyId: string, versionNumber: number): Promise<AiSkillVersionRecord | null> {
    const { data, error } = await this.client
      .from("ai_skill_versions")
      .select("*")
      .eq("skill_id", skillId)
      .eq("company_id", companyId)
      .eq("version_number", versionNumber)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapVersion(data as VersionRow) : null;
  }

  async recordChangeEvent(input: {
    companyId: string;
    skillId: string;
    eventType: AiSkillChangeEventType;
    metadata?: Record<string, unknown>;
    actorId?: string | null;
  }): Promise<void> {
    const { error } = await this.client.from("ai_skill_change_events").insert({
      company_id: input.companyId,
      skill_id: input.skillId,
      event_type: input.eventType,
      metadata: input.metadata ?? {},
      created_by: input.actorId ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async listChangeEvents(skillId: string, companyId: string, limit = 50): Promise<
    Array<{
      id: string;
      event_type: AiSkillChangeEventType;
      metadata: Record<string, unknown>;
      created_at: string;
      created_by: string | null;
    }>
  > {
    const { data, error } = await this.client
      .from("ai_skill_change_events")
      .select("id, event_type, metadata, created_at, created_by")
      .eq("skill_id", skillId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      event_type: row.event_type as AiSkillChangeEventType,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
      created_by: (row.created_by as string | null) ?? null,
    }));
  }

  async listToolExecutions(companyId: string, toolKeys: string[], limit = 200): Promise<
    Array<{ tool_key: string; status: string; duration_ms: number | null }>
  > {
    if (toolKeys.length === 0) return [];

    const { data, error } = await this.client
      .from("tool_executions")
      .select("tool_key, status, duration_ms")
      .eq("company_id", companyId)
      .in("tool_key", toolKeys)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      tool_key: row.tool_key as string,
      status: row.status as string,
      duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
    }));
  }
}
