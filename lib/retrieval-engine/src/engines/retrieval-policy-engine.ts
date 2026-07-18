import {
  DEFAULT_MAX_CHUNKS,
  DEFAULT_MAX_CONTEXT_TOKENS,
  DEFAULT_MIN_SOURCE_DIVERSITY,
  DEFAULT_OVERLAP_REMOVAL_THRESHOLD,
  DEFAULT_WINDOW_EXPANSION,
  RETRIEVAL_PERMISSIONS,
} from "../constants.js";
import { PermissionDeniedError, RetrievalPolicyNotFoundError, ValidationError } from "../errors/error-catalog.js";
import type { RetrievalPolicyRepository } from "../repositories/retrieval-repositories.js";
import type {
  CreateRetrievalPolicyInput,
  ResolvedRetrievalPolicy,
  RetrievalPolicyRecord,
  ServiceContext,
  UpdateRetrievalPolicyInput,
} from "../types.js";

function assertCompanyAccess(ctx: ServiceContext, companyId: string, correlationId?: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(RETRIEVAL_PERMISSIONS.view, correlationId);
  }
}

function assertPermission(ctx: ServiceContext, permission: string, correlationId?: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission, correlationId);
  }
}

export class RetrievalPolicyEngine {
  constructor(private readonly policyRepository: RetrievalPolicyRepository) {}

  async listPolicies(ctx: ServiceContext, companyId: string): Promise<RetrievalPolicyRecord[]> {
    assertPermission(ctx, RETRIEVAL_PERMISSIONS.view);
    assertCompanyAccess(ctx, companyId);
    return this.policyRepository.findByCompany(companyId);
  }

  async createPolicy(ctx: ServiceContext, input: CreateRetrievalPolicyInput): Promise<RetrievalPolicyRecord> {
    assertPermission(ctx, RETRIEVAL_PERMISSIONS.manage);
    assertCompanyAccess(ctx, input.companyId);
    this.validatePolicyLimits(input.maxContextTokens, input.maxChunks, input.overlapRemovalThreshold);

    return this.policyRepository.create({
      ...input,
      maxContextTokens: input.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
      maxChunks: input.maxChunks ?? DEFAULT_MAX_CHUNKS,
      windowExpansion: input.windowExpansion ?? DEFAULT_WINDOW_EXPANSION,
      minSourceDiversity: input.minSourceDiversity ?? DEFAULT_MIN_SOURCE_DIVERSITY,
      overlapRemovalThreshold: input.overlapRemovalThreshold ?? DEFAULT_OVERLAP_REMOVAL_THRESHOLD,
      chunkSelectionStrategy: input.chunkSelectionStrategy ?? "score_first",
    });
  }

  async updatePolicy(ctx: ServiceContext, input: UpdateRetrievalPolicyInput): Promise<RetrievalPolicyRecord> {
    assertPermission(ctx, RETRIEVAL_PERMISSIONS.manage);
    const existing = await this.policyRepository.findById(input.policyId);
    if (!existing) throw new RetrievalPolicyNotFoundError(input.policyId);
    assertCompanyAccess(ctx, existing.company_id);

    this.validatePolicyLimits(
      input.maxContextTokens ?? existing.max_context_tokens,
      input.maxChunks ?? existing.max_chunks,
      input.overlapRemovalThreshold ?? existing.overlap_removal_threshold,
    );

    return this.policyRepository.update(input);
  }

  async archivePolicy(ctx: ServiceContext, policyId: string): Promise<RetrievalPolicyRecord> {
    assertPermission(ctx, RETRIEVAL_PERMISSIONS.manage);
    const existing = await this.policyRepository.findById(policyId);
    if (!existing) throw new RetrievalPolicyNotFoundError(policyId);
    assertCompanyAccess(ctx, existing.company_id);
    return this.policyRepository.archive(policyId);
  }

  async resolvePolicy(
    ctx: ServiceContext,
    companyId: string,
    input?: { policyId?: string; maxTokenBudget?: number },
    correlationId?: string,
  ): Promise<ResolvedRetrievalPolicy> {
    assertPermission(ctx, RETRIEVAL_PERMISSIONS.execute, correlationId);
    assertCompanyAccess(ctx, companyId, correlationId);

    let policy: RetrievalPolicyRecord | null = null;
    if (input?.policyId) {
      policy = await this.policyRepository.findById(input.policyId);
      if (!policy || policy.company_id !== companyId) {
        throw new RetrievalPolicyNotFoundError(input.policyId, correlationId);
      }
    } else {
      policy = await this.policyRepository.findDefault(companyId);
    }

    const resolved: ResolvedRetrievalPolicy = {
      policyId: policy?.id ?? null,
      maxContextTokens: input?.maxTokenBudget ?? policy?.max_context_tokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
      maxChunks: policy?.max_chunks ?? DEFAULT_MAX_CHUNKS,
      windowExpansion: policy?.window_expansion ?? DEFAULT_WINDOW_EXPANSION,
      minSourceDiversity: policy?.min_source_diversity ?? DEFAULT_MIN_SOURCE_DIVERSITY,
      overlapRemovalThreshold: policy?.overlap_removal_threshold ?? DEFAULT_OVERLAP_REMOVAL_THRESHOLD,
      defaultLanguage: policy?.default_language ?? null,
      sourcePriority: policy?.source_priority ?? {},
      departmentPriority: policy?.department_priority ?? {},
      chunkSelectionStrategy: policy?.chunk_selection_strategy ?? "score_first",
      metadata: policy?.metadata ?? {},
    };

    this.validatePolicyLimits(
      resolved.maxContextTokens,
      resolved.maxChunks,
      resolved.overlapRemovalThreshold,
      correlationId,
    );

    return resolved;
  }

  private validatePolicyLimits(
    maxContextTokens?: number,
    maxChunks?: number,
    overlapThreshold?: number,
    correlationId?: string,
  ): void {
    if (maxContextTokens !== undefined && maxContextTokens <= 0) {
      throw new ValidationError("max_context_tokens must be greater than zero.", correlationId);
    }
    if (maxChunks !== undefined && maxChunks <= 0) {
      throw new ValidationError("max_chunks must be greater than zero.", correlationId);
    }
    if (overlapThreshold !== undefined && (overlapThreshold < 0 || overlapThreshold > 1)) {
      throw new ValidationError("overlap_removal_threshold must be between 0 and 1.", correlationId);
    }
  }
}
