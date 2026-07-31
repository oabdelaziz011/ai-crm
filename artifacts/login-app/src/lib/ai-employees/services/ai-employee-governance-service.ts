import type { AiEmployeeRepository } from "@/lib/ai-employees/repositories";
import type { AiEmployeeGovernanceRepository } from "@/lib/ai-employees/repositories/ai-employee-governance-repository";
import type { AiEmployeeSkillRepository } from "@/lib/ai-employees/repositories/ai-employee-skill-repository";
import { buildToolMetadataCatalog } from "@/lib/ai-employees/adapters/tool-metadata-adapter";
import {
  buildGovernanceSnapshot,
  detectGovernanceViolations,
  mapGovernancePolicy,
} from "@/lib/ai-employees/selectors/governance-selectors";
import { mapSkillRows } from "@/lib/ai-employees/selectors/skill-selectors";
import type {
  AiEmployeeRecord,
  AiGovernancePlatformSnapshot,
  AiGovernancePolicyFormValues,
  CreateAiGovernancePolicyInput,
  UpdateAiGovernancePolicyInput,
} from "@/lib/ai-employees/types";
import type { AiEmployeeRegistryService } from "./ai-employee-registry-service";
import { AiEmployeeGovernanceError } from "./ai-employee-governance-errors";

export class AiEmployeeGovernanceService {
  constructor(
    private readonly governance: AiEmployeeGovernanceRepository,
    private readonly employees: AiEmployeeRepository,
    private readonly skills: AiEmployeeSkillRepository,
    private readonly registry: AiEmployeeRegistryService,
  ) {}

  async loadSnapshot(companyId: string, employee: AiEmployeeRecord): Promise<AiGovernancePlatformSnapshot> {
    const [policyRows, allEmployees, skillRows, dbTools, approvalRows, violationRows, auditRows] =
      await Promise.all([
        this.governance.ensureDefaultPolicies(companyId),
        this.registry.list(companyId),
        this.skills.listByCompany(companyId),
        this.employees.listEnabledTools(),
        this.governance.listApprovals(companyId),
        this.governance.listViolations(companyId),
        this.governance.listAuditEvents(companyId, employee.id),
      ]);

    const skills = mapSkillRows(skillRows);
    await this.governance.syncPendingApprovals(
      companyId,
      allEmployees.map((entry) => ({
        id: entry.id,
        displayName: entry.displayName,
        hasUnpublishedDraft: entry.hasUnpublishedDraft,
        status: entry.status,
      })),
      skills.map((entry) => ({
        id: entry.id,
        displayName: entry.displayName,
        status: entry.status,
        hasUnpublishedDraft: entry.hasUnpublishedDraft,
      })),
    );

    const toolCatalog = buildToolMetadataCatalog(dbTools);
    const snapshot = buildGovernanceSnapshot({
      employee,
      policyRows,
      employees: allEmployees,
      skills,
      toolCatalog,
      approvalRows,
      violationRows,
      auditRows,
    });

    await this.governance.recordAuditEvent({
      companyId,
      employeeId: employee.id,
      eventType: "risk_assessed",
      metadata: { level: snapshot.riskAssessment.level, score: snapshot.riskAssessment.score },
    });

    return snapshot;
  }

  async createPolicy(input: CreateAiGovernancePolicyInput) {
    const existing = await this.governance.getPolicyByKey(input.companyId, input.values.key);
    if (existing) {
      throw new AiEmployeeGovernanceError("Policy key already exists", "duplicate_key");
    }

    const row = await this.governance.createPolicy({
      company_id: input.companyId,
      key: input.values.key.trim(),
      name: input.values.name.trim(),
      display_name: input.values.displayName.trim(),
      description: input.values.description.trim(),
      category: input.values.category,
      config: input.values.config,
      department: input.values.department ?? null,
      status: "draft",
      created_by: input.actorId ?? null,
      updated_by: input.actorId ?? null,
    });

    await this.governance.recordAuditEvent({
      companyId: input.companyId,
      policyId: row.id,
      eventType: "policy_created",
      actorId: input.actorId,
    });

    return mapGovernancePolicy(row);
  }

  async updatePolicy(input: UpdateAiGovernancePolicyInput) {
    const existing = await this.governance.getPolicyById(input.policyId, input.companyId);
    if (!existing) {
      throw new AiEmployeeGovernanceError("Policy not found", "not_found");
    }
    if (existing.status === "archived") {
      throw new AiEmployeeGovernanceError("Archived policies cannot be edited", "invalid_state");
    }

    const row = await this.governance.updatePolicy(input.policyId, input.companyId, {
      ...(input.values.name != null ? { name: input.values.name.trim() } : {}),
      ...(input.values.displayName != null ? { display_name: input.values.displayName.trim() } : {}),
      ...(input.values.description != null ? { description: input.values.description.trim() } : {}),
      ...(input.values.category != null ? { category: input.values.category } : {}),
      ...(input.values.config != null ? { config: input.values.config } : {}),
      ...(input.values.department !== undefined ? { department: input.values.department } : {}),
      version_number: existing.version_number + 1,
      updated_by: input.actorId ?? null,
    });

    await this.governance.recordAuditEvent({
      companyId: input.companyId,
      policyId: row.id,
      eventType: "policy_updated",
      actorId: input.actorId,
    });

    return mapGovernancePolicy(row);
  }

  async archivePolicy(policyId: string, companyId: string, actorId?: string | null) {
    const row = await this.governance.archivePolicy(policyId, companyId, actorId);
    await this.governance.recordAuditEvent({
      companyId,
      policyId,
      eventType: "policy_archived",
      actorId,
    });
    return mapGovernancePolicy(row);
  }

  async restorePolicy(policyId: string, companyId: string, actorId?: string | null) {
    const row = await this.governance.restorePolicy(policyId, companyId, actorId);
    await this.governance.recordAuditEvent({
      companyId,
      policyId,
      eventType: "policy_restored",
      actorId,
    });
    return mapGovernancePolicy(row);
  }

  async publishPolicy(policyId: string, companyId: string, actorId?: string | null) {
    const row = await this.governance.updatePolicy(policyId, companyId, {
      status: "published",
      updated_by: actorId ?? null,
    });
    await this.governance.recordAuditEvent({
      companyId,
      policyId,
      eventType: "policy_published",
      actorId,
    });
    return mapGovernancePolicy(row);
  }

  async validateEmployee(input: {
    companyId: string;
    employee: AiEmployeeRecord;
  }): Promise<AiGovernancePlatformSnapshot["riskAssessment"]> {
    const snapshot = await this.loadSnapshot(input.companyId, input.employee);
    const detected = detectGovernanceViolations({
      employee: input.employee,
      modelPolicy: snapshot.modelPolicy,
      providerPolicy: snapshot.providerPolicy,
      toolRestrictions: snapshot.toolRestrictions,
    });

    for (const violation of detected) {
      await this.governance.recordAuditEvent({
        companyId: input.companyId,
        employeeId: input.employee.id,
        eventType: "violation_detected",
        metadata: violation,
      });
    }

    return snapshot.riskAssessment;
  }
}
