import {
  DEFAULT_MAXIMUM_RESULTS,
  DEFAULT_MINIMUM_SIMILARITY,
  DEFAULT_TOP_K,
  GENERIC_METADATA_FILTER_KEYS,
  VECTOR_QUERY_PERMISSIONS,
} from "../constants.js";
import { PermissionDeniedError, SearchPolicyNotFoundError, ValidationError } from "../errors.js";
import type { SearchPolicyRepository } from "../repositories/vector-query-repositories.js";
import type {
  CreateSearchPolicyInput,
  MetadataFilter,
  ResolvedSearchPolicy,
  ServiceContext,
  UpdateSearchPolicyInput,
  VectorSearchPolicyRecord,
} from "../types.js";

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(VECTOR_QUERY_PERMISSIONS.view);
  }
}

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

export class VectorQueryPolicyService {
  constructor(private readonly policyRepository: SearchPolicyRepository) {}

  async listPolicies(ctx: ServiceContext, companyId: string): Promise<VectorSearchPolicyRecord[]> {
    assertPermission(ctx, VECTOR_QUERY_PERMISSIONS.view);
    assertCompanyAccess(ctx, companyId);
    return this.policyRepository.findByCompany(companyId);
  }

  async createPolicy(ctx: ServiceContext, input: CreateSearchPolicyInput): Promise<VectorSearchPolicyRecord> {
    assertPermission(ctx, VECTOR_QUERY_PERMISSIONS.manage);
    assertCompanyAccess(ctx, input.companyId);
    this.validatePolicyLimits(input.defaultTopK, input.minimumSimilarityScore, input.maximumResults);

    return this.policyRepository.create({
      ...input,
      defaultTopK: input.defaultTopK ?? DEFAULT_TOP_K,
      minimumSimilarityScore: input.minimumSimilarityScore ?? DEFAULT_MINIMUM_SIMILARITY,
      maximumResults: input.maximumResults ?? DEFAULT_MAXIMUM_RESULTS,
    });
  }

  async updatePolicy(ctx: ServiceContext, input: UpdateSearchPolicyInput): Promise<VectorSearchPolicyRecord> {
    assertPermission(ctx, VECTOR_QUERY_PERMISSIONS.manage);

    const existing = await this.policyRepository.findById(input.policyId);
    if (!existing) throw new SearchPolicyNotFoundError(input.policyId);
    assertCompanyAccess(ctx, existing.company_id);

    this.validatePolicyLimits(
      input.defaultTopK ?? existing.default_top_k,
      input.minimumSimilarityScore ?? existing.minimum_similarity_score,
      input.maximumResults ?? existing.maximum_results,
    );

    return this.policyRepository.update(input);
  }

  async resolvePolicy(
    ctx: ServiceContext,
    companyId: string,
    input?: { policyId?: string; topK?: number; minimumSimilarityScore?: number; maximumResults?: number },
  ): Promise<ResolvedSearchPolicy> {
    assertPermission(ctx, VECTOR_QUERY_PERMISSIONS.execute);
    assertCompanyAccess(ctx, companyId);

    let policy: VectorSearchPolicyRecord | null = null;
    if (input?.policyId) {
      policy = await this.policyRepository.findById(input.policyId);
      if (!policy || policy.company_id !== companyId) {
        throw new SearchPolicyNotFoundError(input.policyId);
      }
    } else {
      policy = await this.policyRepository.findDefault(companyId);
    }

    const resolved: ResolvedSearchPolicy = {
      policyId: policy?.id ?? null,
      defaultTopK: input?.topK ?? policy?.default_top_k ?? DEFAULT_TOP_K,
      minimumSimilarityScore:
        input?.minimumSimilarityScore ?? policy?.minimum_similarity_score ?? DEFAULT_MINIMUM_SIMILARITY,
      maximumResults: input?.maximumResults ?? policy?.maximum_results ?? DEFAULT_MAXIMUM_RESULTS,
      metadata: policy?.metadata ?? {},
    };

    this.validatePolicyLimits(
      resolved.defaultTopK,
      resolved.minimumSimilarityScore,
      resolved.maximumResults,
    );

    return resolved;
  }

  validateMetadataFilters(filters?: MetadataFilter, correlationId?: string): void {
    if (!filters) return;

    for (const key of Object.keys(filters)) {
      if (!GENERIC_METADATA_FILTER_KEYS.includes(key as (typeof GENERIC_METADATA_FILTER_KEYS)[number])) {
        throw new ValidationError(`Unsupported metadata filter key: ${key}`, correlationId);
      }
    }
  }

  async archivePolicy(ctx: ServiceContext, policyId: string): Promise<VectorSearchPolicyRecord> {
    assertPermission(ctx, VECTOR_QUERY_PERMISSIONS.manage);
    const existing = await this.policyRepository.findById(policyId);
    if (!existing) throw new SearchPolicyNotFoundError(policyId);
    assertCompanyAccess(ctx, existing.company_id);
    return this.policyRepository.archive(policyId);
  }

  private validatePolicyLimits(topK?: number, minimumScore?: number, maximumResults?: number): void {
    if (topK !== undefined && topK <= 0) {
      throw new ValidationError("default_top_k must be greater than zero.");
    }
    if (minimumScore !== undefined && (minimumScore < 0 || minimumScore > 1)) {
      throw new ValidationError("minimum_similarity_score must be between 0 and 1.");
    }
    if (maximumResults !== undefined && maximumResults <= 0) {
      throw new ValidationError("maximum_results must be greater than zero.");
    }
    if (topK !== undefined && maximumResults !== undefined && topK > maximumResults) {
      throw new ValidationError("default_top_k cannot exceed maximum_results.");
    }
  }
}
