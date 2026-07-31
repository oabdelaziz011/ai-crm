import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiGovernanceApprovalStatus,
  AiGovernanceApprovalType,
  AiGovernanceAuditEventType,
  AiGovernancePolicyCategory,
  AiGovernancePolicyDbRow,
  AiGovernancePolicyStatus,
  AiGovernanceRiskLevel,
} from "@/lib/ai-employees/types";

const DEFAULT_PROVIDERS = ["openai", "anthropic", "google", "azure", "openrouter", "custom"];

const DEFAULT_SEED_POLICIES: Array<{
  key: string;
  name: string;
  display_name: string;
  category: AiGovernancePolicyCategory;
  config: Record<string, unknown>;
}> = [
  {
    key: "default-model-policy",
    name: "default-model-policy",
    display_name: "Default Model Policy",
    category: "model",
    config: {
      allowedModels: ["gpt-4.1", "gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"],
      blockedModels: [],
      defaultModel: "gpt-4.1",
      departmentRestrictions: { Sales: ["gpt-4.1"], Support: ["gpt-4o"] },
    },
  },
  {
    key: "default-provider-policy",
    name: "default-provider-policy",
    display_name: "Default Provider Policy",
    category: "provider",
    config: {
      allowedProviders: DEFAULT_PROVIDERS,
      blockedProviders: [],
      defaultProvider: "openai",
    },
  },
  {
    key: "default-tool-policy",
    name: "default-tool-policy",
    display_name: "Default Tool Restrictions",
    category: "tool",
    config: { blockedTools: [], confirmationRequired: ["refund_payment", "merge_customers"] },
  },
  {
    key: "default-data-policy",
    name: "default-data-policy",
    display_name: "Data Retention Policy",
    category: "data",
    config: { retentionDays: 90, gdprEnabled: true, privacyRules: ["PII masking", "Consent required"] },
  },
  {
    key: "default-compliance-policy",
    name: "default-compliance-policy",
    display_name: "Compliance Framework",
    category: "compliance",
    config: {
      gdprEnabled: true,
      auditStatus: "compliant",
      securityControls: ["RBAC", "Tenant isolation", "Audit trail"],
    },
  },
  {
    key: "default-approval-rules",
    name: "default-approval-rules",
    display_name: "Approval Rules",
    category: "approval",
    config: {
      publishApproval: true,
      promptApproval: true,
      skillApproval: true,
      policyApproval: true,
    },
  },
];

export class AiEmployeeGovernanceRepository {
  constructor(private readonly client: SupabaseClient) {}

  normalizePolicy(row: AiGovernancePolicyDbRow): AiGovernancePolicyDbRow {
    return { ...row, config: row.config ?? {} };
  }

  async ensureDefaultPolicies(companyId: string): Promise<AiGovernancePolicyDbRow[]> {
    const existing = await this.listPolicies(companyId);
    if (existing.length >= DEFAULT_SEED_POLICIES.length) return existing;

    for (const seed of DEFAULT_SEED_POLICIES) {
      if (existing.some((policy) => policy.key === seed.key)) continue;
      const { error } = await this.client.from("ai_governance_policies").insert({
        company_id: companyId,
        key: seed.key,
        name: seed.name,
        display_name: seed.display_name,
        description: `${seed.display_name} for tenant governance`,
        category: seed.category,
        config: seed.config,
        status: "published",
        version_number: 1,
      });
      if (error && !error.message.includes("duplicate")) {
        throw new Error(error.message);
      }
    }

    return this.listPolicies(companyId);
  }

  async listPolicies(companyId: string, category?: AiGovernancePolicyCategory): Promise<AiGovernancePolicyDbRow[]> {
    let query = this.client
      .from("ai_governance_policies")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (category) query = query.eq("category", category);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.normalizePolicy(row as AiGovernancePolicyDbRow));
  }

  async getPolicyById(id: string, companyId: string): Promise<AiGovernancePolicyDbRow | null> {
    const { data, error } = await this.client
      .from("ai_governance_policies")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? this.normalizePolicy(data as AiGovernancePolicyDbRow) : null;
  }

  async getPolicyByKey(companyId: string, key: string, excludeId?: string): Promise<AiGovernancePolicyDbRow | null> {
    let query = this.client
      .from("ai_governance_policies")
      .select("*")
      .eq("company_id", companyId)
      .ilike("key", key)
      .is("deleted_at", null);

    if (excludeId) query = query.neq("id", excludeId);

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.normalizePolicy(data as AiGovernancePolicyDbRow) : null;
  }

  async createPolicy(
    values: Partial<AiGovernancePolicyDbRow> & Pick<AiGovernancePolicyDbRow, "company_id" | "key" | "name" | "display_name" | "category">,
  ): Promise<AiGovernancePolicyDbRow> {
    const { data, error } = await this.client.from("ai_governance_policies").insert(values).select("*").single();
    if (error) throw new Error(error.message);
    return this.normalizePolicy(data as AiGovernancePolicyDbRow);
  }

  async updatePolicy(id: string, companyId: string, values: Partial<AiGovernancePolicyDbRow>): Promise<AiGovernancePolicyDbRow> {
    const { data, error } = await this.client
      .from("ai_governance_policies")
      .update(values)
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return this.normalizePolicy(data as AiGovernancePolicyDbRow);
  }

  async archivePolicy(id: string, companyId: string, actorId?: string | null): Promise<AiGovernancePolicyDbRow> {
    return this.updatePolicy(id, companyId, { status: "archived", updated_by: actorId ?? null });
  }

  async restorePolicy(id: string, companyId: string, actorId?: string | null): Promise<AiGovernancePolicyDbRow> {
    return this.updatePolicy(id, companyId, { status: "draft", deleted_at: null, updated_by: actorId ?? null });
  }

  async listApprovals(companyId: string, limit = 50): Promise<
    Array<{
      id: string;
      entity_type: string;
      entity_id: string;
      entity_label: string;
      approval_type: AiGovernanceApprovalType;
      status: AiGovernanceApprovalStatus;
      created_at: string;
      reviewed_at: string | null;
    }>
  > {
    const { data, error } = await this.client
      .from("ai_governance_approvals")
      .select("id, entity_type, entity_id, entity_label, approval_type, status, created_at, reviewed_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      entity_type: string;
      entity_id: string;
      entity_label: string;
      approval_type: AiGovernanceApprovalType;
      status: AiGovernanceApprovalStatus;
      created_at: string;
      reviewed_at: string | null;
    }>;
  }

  async listViolations(companyId: string, limit = 50): Promise<
    Array<{
      id: string;
      employee_id: string | null;
      policy_id: string | null;
      violation_type: string;
      severity: AiGovernanceRiskLevel;
      message: string;
      resolved: boolean;
      created_at: string;
    }>
  > {
    const { data, error } = await this.client
      .from("ai_governance_violations")
      .select("id, employee_id, policy_id, violation_type, severity, message, resolved, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      employee_id: string | null;
      policy_id: string | null;
      violation_type: string;
      severity: AiGovernanceRiskLevel;
      message: string;
      resolved: boolean;
      created_at: string;
    }>;
  }

  async listAuditEvents(companyId: string, employeeId?: string, limit = 100): Promise<
    Array<{
      id: string;
      employee_id: string | null;
      policy_id: string | null;
      event_type: AiGovernanceAuditEventType;
      metadata: Record<string, unknown>;
      created_at: string;
      created_by: string | null;
    }>
  > {
    let query = this.client
      .from("ai_governance_audit_events")
      .select("id, employee_id, policy_id, event_type, metadata, created_at, created_by")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (employeeId) query = query.eq("employee_id", employeeId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      employee_id: (row.employee_id as string | null) ?? null,
      policy_id: (row.policy_id as string | null) ?? null,
      event_type: row.event_type as AiGovernanceAuditEventType,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
      created_by: (row.created_by as string | null) ?? null,
    }));
  }

  async recordAuditEvent(input: {
    companyId: string;
    employeeId?: string | null;
    policyId?: string | null;
    eventType: AiGovernanceAuditEventType;
    metadata?: Record<string, unknown>;
    actorId?: string | null;
  }): Promise<void> {
    const { error } = await this.client.from("ai_governance_audit_events").insert({
      company_id: input.companyId,
      employee_id: input.employeeId ?? null,
      policy_id: input.policyId ?? null,
      event_type: input.eventType,
      metadata: input.metadata ?? {},
      created_by: input.actorId ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async syncPendingApprovals(
    companyId: string,
    employees: Array<{ id: string; displayName: string; hasUnpublishedDraft: boolean; status: string }>,
    skills: Array<{ id: string; displayName: string; status: string; hasUnpublishedDraft: boolean }>,
  ): Promise<void> {
    for (const employee of employees) {
      if (!employee.hasUnpublishedDraft && employee.status !== "draft") continue;
      const { error } = await this.client.from("ai_governance_approvals").upsert(
        {
          company_id: companyId,
          entity_type: employee.hasUnpublishedDraft ? "prompt" : "employee",
          entity_id: employee.id,
          entity_label: employee.displayName,
          approval_type: "publish",
          status: "pending",
        },
        { onConflict: "company_id,entity_id,approval_type", ignoreDuplicates: true },
      );
      if (error && !error.message.includes("duplicate") && !error.message.includes("no unique")) {
        // upsert conflict target may not exist until migration applied — ignore gracefully
      }
    }

    for (const skill of skills) {
      if (skill.status !== "draft" && !skill.hasUnpublishedDraft) continue;
      await this.client.from("ai_governance_approvals").insert({
        company_id: companyId,
        entity_type: "skill",
        entity_id: skill.id,
        entity_label: skill.displayName,
        approval_type: "skill",
        status: "pending",
      });
    }
  }
}
