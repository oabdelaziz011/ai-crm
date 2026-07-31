import type { AiEmployeeRepository } from "@/lib/ai-employees/repositories";
import type { AiEmployeeLifecycleRepository } from "@/lib/ai-employees/repositories/ai-employee-lifecycle-repository";
import { compareEmployeeVersionSnapshots, employeeToVersionSnapshot } from "@/lib/ai-employees/selectors/lifecycle-selectors";
import type {
  AiEmployeeChangeEventType,
  AiEmployeeConfigurationUpdate,
  AiEmployeeRecord,
  AiEmployeeVersionComparison,
  PublishAiEmployeeInput,
  RollbackAiEmployeeInput,
} from "@/lib/ai-employees/types";
import type { AiEmployeeConfigurationService } from "./ai-employee-configuration-service";
import { AiEmployeeLifecycleError } from "./ai-employee-lifecycle-errors";
import {
  buildReadinessScore,
  buildValidationResult,
  hasBlockingPublishIssues,
} from "./ai-employee-validation-service";
import type { AiEmployeeRegistryService } from "./ai-employee-registry-service";

export class AiEmployeeLifecycleService {
  constructor(
    private readonly registry: AiEmployeeRegistryService,
    private readonly employees: AiEmployeeRepository,
    private readonly lifecycle: AiEmployeeLifecycleRepository,
    private readonly configuration: AiEmployeeConfigurationService,
  ) {}

  async validateForPublish(employee: AiEmployeeRecord, preview: Awaited<ReturnType<AiEmployeeConfigurationService["buildRuntimePreview"]>>) {
    const validation = buildValidationResult(preview);
    const readiness = buildReadinessScore(preview);
    return { validation, readiness, preview };
  }

  async publish(input: PublishAiEmployeeInput, preview: Awaited<ReturnType<AiEmployeeConfigurationService["buildRuntimePreview"]>>) {
    const employee = await this.registry.getById(input.employeeId, input.companyId);
    if (!employee) {
      throw new AiEmployeeLifecycleError("AI Employee not found", "not_found");
    }
    if (employee.status === "archived") {
      throw new AiEmployeeLifecycleError("Archived employees cannot be published", "invalid_state");
    }

    const { validation, readiness } = await this.validateForPublish(employee, preview);
    if (hasBlockingPublishIssues(validation) || !readiness.ready) {
      throw new AiEmployeeLifecycleError("Employee is not ready to publish", "validation", { validation, readiness });
    }

    const versionNumber = await this.lifecycle.getNextVersionNumber(input.employeeId, input.companyId);
    const snapshot = employeeToVersionSnapshot(employee);
    const version = await this.lifecycle.createVersion({
      companyId: input.companyId,
      employeeId: input.employeeId,
      versionNumber,
      snapshot,
      publishNotes: input.publishNotes?.trim() ?? "",
      actorId: input.actorId,
    });

    await this.lifecycle.markVersionsSuperseded(input.employeeId, input.companyId, version.id);
    const deployment = await this.lifecycle.createDeployment({
      companyId: input.companyId,
      employeeId: input.employeeId,
      versionId: version.id,
      versionNumber,
      publishNotes: input.publishNotes?.trim() ?? "",
      actorId: input.actorId,
    });

    await this.employees.update(input.employeeId, input.companyId, {
      status: "published",
      published_version_id: version.id,
      current_version_number: versionNumber,
      has_unpublished_draft: false,
      updated_by: input.actorId ?? null,
    });

    await this.lifecycle.recordChangeEvent({
      companyId: input.companyId,
      employeeId: input.employeeId,
      eventType: "published",
      metadata: { versionNumber, deploymentId: deployment.id, publishNotes: input.publishNotes ?? "" },
      actorId: input.actorId,
    });

    return { version, deployment, validation, readiness };
  }

  async rollback(input: RollbackAiEmployeeInput) {
    const employee = await this.registry.getById(input.employeeId, input.companyId);
    if (!employee) {
      throw new AiEmployeeLifecycleError("AI Employee not found", "not_found");
    }

    const version = await this.lifecycle.getVersionByNumber(
      input.employeeId,
      input.companyId,
      input.versionNumber,
    );
    if (!version) {
      throw new AiEmployeeLifecycleError("Version not found", "not_found");
    }

    await this.employees.update(input.employeeId, input.companyId, {
      display_name: version.snapshot.displayName,
      description: version.snapshot.description,
      avatar: version.snapshot.avatar,
      department: version.snapshot.department,
      provider: version.snapshot.provider,
      model: version.snapshot.model,
      temperature: version.snapshot.temperature,
      max_tokens: version.snapshot.maxTokens,
      system_prompt: version.snapshot.systemPrompt,
      system_prompt_summary: version.snapshot.systemPromptSummary,
      knowledge_source_ids: version.snapshot.knowledgeSourceIds,
      knowledge_summary: version.snapshot.knowledgeSummary,
      allowed_tool_keys: version.snapshot.allowedToolKeys,
      tool_summary: version.snapshot.toolSummary,
      prompt_version_label: version.snapshot.promptVersionLabel,
      runtime_configuration: version.snapshot.runtimeConfiguration,
      tags: version.snapshot.tags,
      status: "published",
      published_version_id: version.id,
      current_version_number: version.versionNumber,
      has_unpublished_draft: false,
      updated_by: input.actorId ?? null,
    });

    const deployment = await this.lifecycle.createDeployment({
      companyId: input.companyId,
      employeeId: input.employeeId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      publishNotes: `Rollback to v${version.versionNumber}`,
      actorId: input.actorId,
      status: "rolled_back",
    });

    await this.lifecycle.recordChangeEvent({
      companyId: input.companyId,
      employeeId: input.employeeId,
      eventType: "rolled_back",
      metadata: { versionNumber: version.versionNumber, deploymentId: deployment.id },
      actorId: input.actorId,
    });

    return this.registry.getById(input.employeeId, input.companyId);
  }

  async archive(employeeId: string, companyId: string, actorId?: string | null) {
    await this.employees.update(employeeId, companyId, {
      status: "archived",
      updated_by: actorId ?? null,
    });
    await this.lifecycle.recordChangeEvent({
      companyId,
      employeeId,
      eventType: "archived",
      actorId,
    });
  }

  async restore(employeeId: string, companyId: string, actorId?: string | null) {
    const row = await this.employees.getByIdIncludingDeleted(employeeId, companyId);
    if (!row) {
      throw new AiEmployeeLifecycleError("AI Employee not found", "not_found");
    }
    if (row.status !== "archived") {
      throw new AiEmployeeLifecycleError("Only archived employees can be restored", "invalid_state");
    }

    await this.employees.restoreArchived(employeeId, companyId, actorId);

    await this.lifecycle.recordChangeEvent({
      companyId,
      employeeId,
      eventType: "restored",
      actorId,
    });

    return this.registry.getById(employeeId, companyId);
  }

  async disable(employeeId: string, companyId: string, actorId?: string | null) {
    await this.employees.update(employeeId, companyId, {
      status: "disabled",
      updated_by: actorId ?? null,
    });
    await this.lifecycle.recordChangeEvent({
      companyId,
      employeeId,
      eventType: "disabled",
      actorId,
    });
    return this.registry.getById(employeeId, companyId);
  }

  async enable(employeeId: string, companyId: string, actorId?: string | null) {
    const employee = await this.registry.getById(employeeId, companyId);
    if (!employee) {
      throw new AiEmployeeLifecycleError("AI Employee not found", "not_found");
    }

    const nextStatus = employee.publishedVersionId ? "published" : "draft";
    await this.employees.update(employeeId, companyId, {
      status: nextStatus,
      updated_by: actorId ?? null,
    });
    await this.lifecycle.recordChangeEvent({
      companyId,
      employeeId,
      eventType: "restored",
      metadata: { from: "disabled", to: nextStatus },
      actorId,
    });
    return this.registry.getById(employeeId, companyId);
  }

  async markDraftSaved(employeeId: string, companyId: string, actorId?: string | null) {
    await this.employees.update(employeeId, companyId, {
      has_unpublished_draft: true,
      updated_by: actorId ?? null,
    });
    await this.lifecycle.recordChangeEvent({
      companyId,
      employeeId,
      eventType: "draft_saved",
      actorId,
    });
  }

  async recordConfigurationChange(
    employeeId: string,
    companyId: string,
    patch: AiEmployeeConfigurationUpdate,
    actorId?: string | null,
  ) {
    const eventType = resolveConfigurationChangeEvent(patch);
    if (!eventType) return;
    await this.lifecycle.recordChangeEvent({
      companyId,
      employeeId,
      eventType,
      metadata: { fields: Object.keys(patch) },
      actorId,
    });
    if (eventType !== "published") {
      await this.employees.update(employeeId, companyId, {
        has_unpublished_draft: true,
        updated_by: actorId ?? null,
      });
    }
  }

  listVersions(employeeId: string, companyId: string) {
    return this.lifecycle.listVersions(employeeId, companyId);
  }

  listDeployments(employeeId: string, companyId: string) {
    return this.lifecycle.listDeployments(employeeId, companyId);
  }

  listChangeEvents(employeeId: string, companyId: string) {
    return this.lifecycle.listChangeEvents(employeeId, companyId);
  }

  async compareVersions(
    employeeId: string,
    companyId: string,
    leftVersionNumber: number,
    rightVersionNumber: number,
  ): Promise<AiEmployeeVersionComparison> {
    const [left, right] = await Promise.all([
      this.lifecycle.getVersionByNumber(employeeId, companyId, leftVersionNumber),
      this.lifecycle.getVersionByNumber(employeeId, companyId, rightVersionNumber),
    ]);
    if (!left || !right) {
      throw new AiEmployeeLifecycleError("Version not found", "not_found");
    }
    return compareEmployeeVersionSnapshots(left.snapshot, right.snapshot, left.versionNumber, right.versionNumber);
  }
}

function resolveConfigurationChangeEvent(
  patch: AiEmployeeConfigurationUpdate,
): AiEmployeeChangeEventType | null {
  if (patch.systemPrompt != null || patch.promptVersionLabel != null) return "prompt_updated";
  if (patch.knowledgeSourceIds != null) return "knowledge_updated";
  if (patch.allowedToolKeys != null || patch.disabledToolKeys != null) return "tools_updated";
  if (patch.runtimeConfiguration != null || patch.temperature != null || patch.maxTokens != null) {
    return "runtime_updated";
  }
  if (patch.provider != null || patch.model != null) return "runtime_updated";
  return null;
}
