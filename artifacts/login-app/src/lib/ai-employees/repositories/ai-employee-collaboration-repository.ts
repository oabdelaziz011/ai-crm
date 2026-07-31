import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiEmployeeCollaborationEventType,
  AiEmployeeEscalationType,
  AiEmployeeHandoverStatus,
} from "@/lib/ai-employees/types";

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export type CollaborationGroupRow = {
  id: string;
  company_id: string;
  key: string;
  name: string;
  display_name: string;
  description: string;
  department: string | null;
  tags: string[];
};

export type CollaborationHandoverRow = {
  id: string;
  company_id: string;
  source_employee_id: string;
  destination_employee_id: string;
  reason: string;
  status: AiEmployeeHandoverStatus;
  escalation_type: AiEmployeeEscalationType;
  metadata: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
};

export type CollaborationEventRow = {
  id: string;
  company_id: string;
  employee_id: string | null;
  event_type: AiEmployeeCollaborationEventType;
  metadata: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
};

export type CollaborationPolicyRow = {
  id: string;
  company_id: string;
  policy_key: string;
  allowed_collaborations: unknown;
  blocked_collaborations: unknown;
  department_rules: Record<string, unknown>;
  tenant_rules: Record<string, unknown>;
};

const DEFAULT_GROUPS = [
  { key: "sales", name: "sales-team", display_name: "Sales Team", department: "Sales" },
  { key: "support", name: "support-team", display_name: "Support Team", department: "Support" },
  { key: "booking", name: "booking-team", display_name: "Booking Team", department: "Operations" },
  { key: "marketing", name: "marketing-team", display_name: "Marketing Team", department: "Marketing" },
] as const;

export class AiEmployeeCollaborationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async ensureDefaultGroups(companyId: string): Promise<CollaborationGroupRow[]> {
    const existing = await this.listGroups(companyId);
    if (existing.length >= DEFAULT_GROUPS.length) return existing;

    for (const seed of DEFAULT_GROUPS) {
      const found = existing.find((group) => group.key === seed.key);
      if (found) continue;

      const { error } = await this.client.from("ai_employee_groups").insert({
        company_id: companyId,
        key: seed.key,
        name: seed.name,
        display_name: seed.display_name,
        description: `${seed.display_name} collaboration group`,
        department: seed.department,
      });
      if (error && !error.message.includes("duplicate")) {
        throw new Error(error.message);
      }
    }

    return this.listGroups(companyId);
  }

  async listGroups(companyId: string): Promise<CollaborationGroupRow[]> {
    const { data, error } = await this.client
      .from("ai_employee_groups")
      .select("id, company_id, key, name, display_name, description, department, tags")
      .eq("company_id", companyId)
      .order("display_name");

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      company_id: row.company_id as string,
      key: row.key as string,
      name: row.name as string,
      display_name: row.display_name as string,
      description: row.description as string,
      department: (row.department as string | null) ?? null,
      tags: readStringArray(row.tags),
    }));
  }

  async listGroupMembers(companyId: string): Promise<Array<{ group_id: string; employee_id: string }>> {
    const { data, error } = await this.client
      .from("ai_employee_group_members")
      .select("group_id, employee_id")
      .eq("company_id", companyId);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      group_id: row.group_id as string,
      employee_id: row.employee_id as string,
    }));
  }

  async assignEmployeeToGroup(input: {
    companyId: string;
    groupId: string;
    employeeId: string;
  }): Promise<void> {
    const { error } = await this.client.from("ai_employee_group_members").upsert({
      company_id: input.companyId,
      group_id: input.groupId,
      employee_id: input.employeeId,
    });
    if (error) throw new Error(error.message);
  }

  async listHandovers(companyId: string, employeeId?: string, limit = 50): Promise<CollaborationHandoverRow[]> {
    let query = this.client
      .from("ai_employee_handovers")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (employeeId) {
      query = query.or(`source_employee_id.eq.${employeeId},destination_employee_id.eq.${employeeId}`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      company_id: row.company_id as string,
      source_employee_id: row.source_employee_id as string,
      destination_employee_id: row.destination_employee_id as string,
      reason: row.reason as string,
      status: row.status as AiEmployeeHandoverStatus,
      escalation_type: row.escalation_type as AiEmployeeEscalationType,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
      completed_at: (row.completed_at as string | null) ?? null,
      created_by: (row.created_by as string | null) ?? null,
    }));
  }

  async createHandover(input: {
    companyId: string;
    sourceEmployeeId: string;
    destinationEmployeeId: string;
    reason: string;
    escalationType: AiEmployeeEscalationType;
    actorId?: string | null;
  }): Promise<CollaborationHandoverRow> {
    const { data, error } = await this.client
      .from("ai_employee_handovers")
      .insert({
        company_id: input.companyId,
        source_employee_id: input.sourceEmployeeId,
        destination_employee_id: input.destinationEmployeeId,
        reason: input.reason.trim(),
        escalation_type: input.escalationType,
        created_by: input.actorId ?? null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return {
      id: data.id as string,
      company_id: data.company_id as string,
      source_employee_id: data.source_employee_id as string,
      destination_employee_id: data.destination_employee_id as string,
      reason: data.reason as string,
      status: data.status as AiEmployeeHandoverStatus,
      escalation_type: data.escalation_type as AiEmployeeEscalationType,
      metadata: (data.metadata as Record<string, unknown>) ?? {},
      created_at: data.created_at as string,
      completed_at: (data.completed_at as string | null) ?? null,
      created_by: (data.created_by as string | null) ?? null,
    };
  }

  async listCollaborationEvents(companyId: string, employeeId?: string, limit = 100): Promise<CollaborationEventRow[]> {
    let query = this.client
      .from("ai_employee_collaboration_events")
      .select("id, company_id, employee_id, event_type, metadata, created_at, created_by")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (employeeId) {
      query = query.eq("employee_id", employeeId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      company_id: row.company_id as string,
      employee_id: (row.employee_id as string | null) ?? null,
      event_type: row.event_type as AiEmployeeCollaborationEventType,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
      created_by: (row.created_by as string | null) ?? null,
    }));
  }

  async recordCollaborationEvent(input: {
    companyId: string;
    employeeId?: string | null;
    eventType: AiEmployeeCollaborationEventType;
    metadata?: Record<string, unknown>;
    actorId?: string | null;
  }): Promise<void> {
    const { error } = await this.client.from("ai_employee_collaboration_events").insert({
      company_id: input.companyId,
      employee_id: input.employeeId ?? null,
      event_type: input.eventType,
      metadata: input.metadata ?? {},
      created_by: input.actorId ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async getPolicy(companyId: string): Promise<CollaborationPolicyRow | null> {
    const { data, error } = await this.client
      .from("ai_employee_collaboration_policies")
      .select("*")
      .eq("company_id", companyId)
      .eq("policy_key", "default")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return {
      id: data.id as string,
      company_id: data.company_id as string,
      policy_key: data.policy_key as string,
      allowed_collaborations: data.allowed_collaborations,
      blocked_collaborations: data.blocked_collaborations,
      department_rules: (data.department_rules as Record<string, unknown>) ?? {},
      tenant_rules: (data.tenant_rules as Record<string, unknown>) ?? {},
    };
  }

  async ensureDefaultPolicy(companyId: string): Promise<CollaborationPolicyRow> {
    const existing = await this.getPolicy(companyId);
    if (existing) return existing;

    const { data, error } = await this.client
      .from("ai_employee_collaboration_policies")
      .insert({
        company_id: companyId,
        policy_key: "default",
        allowed_collaborations: ["sales:support", "support:booking", "support:marketing"],
        blocked_collaborations: [],
        department_rules: {
          Sales: ["support", "marketing"],
          Support: ["sales", "booking"],
        },
        tenant_rules: { requirePublishedAgents: true, allowCrossDepartment: true },
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return {
      id: data.id as string,
      company_id: data.company_id as string,
      policy_key: data.policy_key as string,
      allowed_collaborations: data.allowed_collaborations,
      blocked_collaborations: data.blocked_collaborations,
      department_rules: (data.department_rules as Record<string, unknown>) ?? {},
      tenant_rules: (data.tenant_rules as Record<string, unknown>) ?? {},
    };
  }

  async listHumanEscalations(companyId: string, limit = 50): Promise<
    Array<{ id: string; state: string; updated_at: string }>
  > {
    const { data, error } = await this.client
      .from("conversations")
      .select("id, state, updated_at")
      .eq("company_id", companyId)
      .eq("state", "transferred_to_human")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {
      return [];
    }

    return (data ?? []).map((row) => ({
      id: row.id as string,
      state: row.state as string,
      updated_at: row.updated_at as string,
    }));
  }
}
