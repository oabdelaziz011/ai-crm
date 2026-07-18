import { DEFAULT_MAX_PIPELINE_DURATION_MS, RUNTIME_PERMISSIONS } from "../constants.js";
import {
  PermissionDeniedError,
  RuntimePolicyNotFoundError,
  ValidationError,
} from "../errors/error-catalog.js";
import type { RuntimePolicyRepository } from "../repositories/runtime-repositories.js";
import type {
  CreateExecutionPolicyInput,
  ExecutionPolicyRecord,
  ResolvedRuntimePolicy,
  ServiceContext,
  UpdateExecutionPolicyInput,
} from "../types.js";

function assertPermission(ctx: ServiceContext, permission: string, correlationId?: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission, correlationId);
  }
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string, correlationId?: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(RUNTIME_PERMISSIONS.view, correlationId);
  }
}

export class RuntimePolicyEngine {
  constructor(private readonly policyRepository: RuntimePolicyRepository) {}

  async listPolicies(ctx: ServiceContext, companyId: string): Promise<ExecutionPolicyRecord[]> {
    assertPermission(ctx, RUNTIME_PERMISSIONS.view);
    assertCompanyAccess(ctx, companyId);
    return this.policyRepository.findByCompany(companyId);
  }

  async createPolicy(ctx: ServiceContext, input: CreateExecutionPolicyInput): Promise<ExecutionPolicyRecord> {
    assertPermission(ctx, RUNTIME_PERMISSIONS.manage);
    assertCompanyAccess(ctx, input.companyId);
    this.validateLimits(input.maxPipelineDurationMs);
    return this.policyRepository.create({
      ...input,
      maxPipelineDurationMs: input.maxPipelineDurationMs ?? DEFAULT_MAX_PIPELINE_DURATION_MS,
    });
  }

  async updatePolicy(ctx: ServiceContext, input: UpdateExecutionPolicyInput): Promise<ExecutionPolicyRecord> {
    assertPermission(ctx, RUNTIME_PERMISSIONS.manage);
    const existing = await this.policyRepository.findById(input.policyId);
    if (!existing) throw new RuntimePolicyNotFoundError(input.policyId);
    assertCompanyAccess(ctx, existing.company_id);
    this.validateLimits(input.maxPipelineDurationMs ?? existing.max_pipeline_duration_ms);
    return this.policyRepository.update(input);
  }

  async archivePolicy(ctx: ServiceContext, policyId: string): Promise<ExecutionPolicyRecord> {
    assertPermission(ctx, RUNTIME_PERMISSIONS.manage);
    const existing = await this.policyRepository.findById(policyId);
    if (!existing) throw new RuntimePolicyNotFoundError(policyId);
    assertCompanyAccess(ctx, existing.company_id);
    return this.policyRepository.archive(policyId);
  }

  async resolvePolicy(
    ctx: ServiceContext,
    companyId: string,
    input?: { policyId?: string },
    correlationId?: string,
  ): Promise<ResolvedRuntimePolicy> {
    assertPermission(ctx, RUNTIME_PERMISSIONS.execute, correlationId);
    assertCompanyAccess(ctx, companyId, correlationId);

    let policy: ExecutionPolicyRecord | null = null;
    if (input?.policyId) {
      policy = await this.policyRepository.findById(input.policyId);
      if (!policy || policy.company_id !== companyId) {
        throw new RuntimePolicyNotFoundError(input.policyId, correlationId);
      }
    } else {
      policy = await this.policyRepository.findDefault(companyId);
    }

    const resolved: ResolvedRuntimePolicy = {
      policyId: policy?.id ?? null,
      knowledgeRetrievalEnabled: policy?.knowledge_retrieval_enabled ?? true,
      maxPipelineDurationMs: policy?.max_pipeline_duration_ms ?? DEFAULT_MAX_PIPELINE_DURATION_MS,
      metadata: policy?.metadata ?? {},
    };

    this.validateLimits(resolved.maxPipelineDurationMs, correlationId);
    return resolved;
  }

  private validateLimits(maxPipelineDurationMs?: number, correlationId?: string): void {
    if (maxPipelineDurationMs !== undefined && maxPipelineDurationMs <= 0) {
      throw new ValidationError("max_pipeline_duration_ms must be greater than zero.", correlationId);
    }
  }
}
