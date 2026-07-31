import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiEmployeeChangeEventType,
  AiEmployeeDeploymentRecord,
  AiEmployeeVersionRecord,
  AiEmployeeVersionSnapshot,
} from "@/lib/ai-employees/types";

type VersionRow = {
  id: string;
  company_id: string;
  employee_id: string;
  version_number: number;
  status: AiEmployeeVersionRecord["status"];
  snapshot: AiEmployeeVersionSnapshot;
  publish_notes: string;
  created_at: string;
  created_by: string | null;
  published_at: string;
  published_by: string | null;
};

type DeploymentRow = {
  id: string;
  company_id: string;
  employee_id: string;
  version_id: string;
  version_number: number;
  status: AiEmployeeDeploymentRecord["status"];
  publish_notes: string;
  published_at: string;
  published_by: string | null;
};

type ChangeEventRow = {
  id: string;
  company_id: string;
  employee_id: string;
  event_type: AiEmployeeChangeEventType;
  metadata: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
};

function mapVersion(row: VersionRow): AiEmployeeVersionRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    employeeId: row.employee_id,
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

function mapDeployment(row: DeploymentRow): AiEmployeeDeploymentRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    employeeId: row.employee_id,
    versionId: row.version_id,
    versionNumber: row.version_number,
    status: row.status,
    publishNotes: row.publish_notes,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
  };
}

export class AiEmployeeLifecycleRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getNextVersionNumber(employeeId: string, companyId: string): Promise<number> {
    const { data, error } = await this.client
      .from("ai_employee_versions")
      .select("version_number")
      .eq("employee_id", employeeId)
      .eq("company_id", companyId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data?.version_number != null ? Number(data.version_number) + 1 : 1;
  }

  async createVersion(input: {
    companyId: string;
    employeeId: string;
    versionNumber: number;
    snapshot: AiEmployeeVersionSnapshot;
    publishNotes: string;
    actorId?: string | null;
  }): Promise<AiEmployeeVersionRecord> {
    const { data, error } = await this.client
      .from("ai_employee_versions")
      .insert({
        company_id: input.companyId,
        employee_id: input.employeeId,
        version_number: input.versionNumber,
        status: "published",
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

  async markVersionsSuperseded(employeeId: string, companyId: string, exceptVersionId: string): Promise<void> {
    const { error } = await this.client
      .from("ai_employee_versions")
      .update({ status: "superseded" })
      .eq("employee_id", employeeId)
      .eq("company_id", companyId)
      .neq("id", exceptVersionId)
      .eq("status", "published");

    if (error) throw new Error(error.message);
  }

  async createDeployment(input: {
    companyId: string;
    employeeId: string;
    versionId: string;
    versionNumber: number;
    publishNotes: string;
    actorId?: string | null;
    status?: AiEmployeeDeploymentRecord["status"];
  }): Promise<AiEmployeeDeploymentRecord> {
    await this.client
      .from("ai_employee_deployments")
      .update({ status: "superseded" })
      .eq("employee_id", input.employeeId)
      .eq("company_id", input.companyId)
      .eq("status", "active");

    const { data, error } = await this.client
      .from("ai_employee_deployments")
      .insert({
        company_id: input.companyId,
        employee_id: input.employeeId,
        version_id: input.versionId,
        version_number: input.versionNumber,
        status: input.status ?? "active",
        publish_notes: input.publishNotes,
        published_by: input.actorId ?? null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return mapDeployment(data as DeploymentRow);
  }

  async listVersions(employeeId: string, companyId: string): Promise<AiEmployeeVersionRecord[]> {
    const { data, error } = await this.client
      .from("ai_employee_versions")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("company_id", companyId)
      .order("version_number", { ascending: false });

    if (error) throw new Error(error.message);
    return ((data ?? []) as VersionRow[]).map(mapVersion);
  }

  async getVersionByNumber(
    employeeId: string,
    companyId: string,
    versionNumber: number,
  ): Promise<AiEmployeeVersionRecord | null> {
    const { data, error } = await this.client
      .from("ai_employee_versions")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("company_id", companyId)
      .eq("version_number", versionNumber)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapVersion(data as VersionRow) : null;
  }

  async listDeployments(employeeId: string, companyId: string): Promise<AiEmployeeDeploymentRecord[]> {
    const { data, error } = await this.client
      .from("ai_employee_deployments")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("company_id", companyId)
      .order("published_at", { ascending: false });

    if (error) throw new Error(error.message);
    return ((data ?? []) as DeploymentRow[]).map(mapDeployment);
  }

  async recordChangeEvent(input: {
    companyId: string;
    employeeId: string;
    eventType: AiEmployeeChangeEventType;
    metadata?: Record<string, unknown>;
    actorId?: string | null;
  }): Promise<void> {
    const { error } = await this.client.from("ai_employee_change_events").insert({
      company_id: input.companyId,
      employee_id: input.employeeId,
      event_type: input.eventType,
      metadata: input.metadata ?? {},
      created_by: input.actorId ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async listChangeEvents(employeeId: string, companyId: string, limit = 50) {
    const { data, error } = await this.client
      .from("ai_employee_change_events")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return ((data ?? []) as ChangeEventRow[]).map((row) => ({
      id: row.id,
      companyId: row.company_id,
      employeeId: row.employee_id,
      eventType: row.event_type,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
      createdBy: row.created_by,
    }));
  }
}
