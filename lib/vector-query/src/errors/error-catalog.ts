export const VECTOR_QUERY_ERROR_CATEGORIES = [
  "validation",
  "authorization",
  "configuration",
  "provider",
  "repository",
  "persistence",
  "normalization",
  "ranking",
  "policy",
  "telemetry",
] as const;

export type VectorQueryErrorCategory = (typeof VECTOR_QUERY_ERROR_CATEGORIES)[number];

export type VectorQueryErrorDescriptor = {
  code: string;
  category: VectorQueryErrorCategory;
  humanMessage: string;
  developerMessage: string;
  recoverable: boolean;
};

export type VectorQueryNormalizedError = VectorQueryErrorDescriptor & {
  correlationId: string | null;
  observabilityCode: string;
};

const OBSERVABILITY_CODE_MAP: Record<VectorQueryErrorCategory, string> = {
  validation: "invalid_configuration",
  authorization: "policy_violation",
  configuration: "invalid_configuration",
  provider: "provider_unavailable",
  repository: "unknown",
  persistence: "unknown",
  normalization: "unknown",
  ranking: "unknown",
  policy: "policy_violation",
  telemetry: "unknown",
};

export function mapCategoryToObservabilityCode(category: VectorQueryErrorCategory): string {
  return OBSERVABILITY_CODE_MAP[category];
}

export function createVectorQueryErrorDescriptor(
  code: string,
  category: VectorQueryErrorCategory,
  humanMessage: string,
  developerMessage?: string,
  recoverable = false,
): VectorQueryErrorDescriptor {
  return {
    code,
    category,
    humanMessage,
    developerMessage: developerMessage ?? humanMessage,
    recoverable,
  };
}

export class VectorQueryErrorCatalogService {
  normalize(error: unknown, correlationId?: string | null): VectorQueryNormalizedError {
    if (error instanceof VectorQueryDomainError) {
      return {
        code: error.code,
        category: error.category,
        humanMessage: error.humanMessage,
        developerMessage: error.developerMessage,
        correlationId: error.correlationId ?? correlationId ?? null,
        recoverable: error.recoverable,
        observabilityCode: mapCategoryToObservabilityCode(error.category),
      };
    }

    if (error instanceof Error) {
      return {
        code: "VECTOR_QUERY_UNKNOWN",
        category: "repository",
        humanMessage: "Vector query failed.",
        developerMessage: error.message,
        correlationId: correlationId ?? null,
        recoverable: false,
        observabilityCode: "unknown",
      };
    }

    return {
      code: "VECTOR_QUERY_UNKNOWN",
      category: "repository",
      humanMessage: "Vector query failed.",
      developerMessage: "Unknown vector query error.",
      correlationId: correlationId ?? null,
      recoverable: false,
      observabilityCode: "unknown",
    };
  }
}

export class VectorQueryDomainError extends Error {
  readonly code: string;
  readonly category: VectorQueryErrorCategory;
  readonly humanMessage: string;
  readonly developerMessage: string;
  readonly correlationId: string | null;
  readonly recoverable: boolean;

  constructor(descriptor: VectorQueryErrorDescriptor, correlationId?: string | null) {
    super(descriptor.developerMessage);
    this.name = "VectorQueryDomainError";
    this.code = descriptor.code;
    this.category = descriptor.category;
    this.humanMessage = descriptor.humanMessage;
    this.developerMessage = descriptor.developerMessage;
    this.correlationId = correlationId ?? null;
    this.recoverable = descriptor.recoverable;
  }
}

export class VectorQueryProviderNotFoundError extends VectorQueryDomainError {
  constructor(key?: string, correlationId?: string | null) {
    super(
      createVectorQueryErrorDescriptor(
        "VECTOR_QUERY_PROVIDER_NOT_FOUND",
        "provider",
        "The selected vector query provider is not available.",
        key ? `Vector query provider ${key} not found.` : "Vector query provider not found.",
      ),
      correlationId,
    );
  }
}

export class VectorStoreConnectionNotFoundError extends VectorQueryDomainError {
  constructor(id?: string, correlationId?: string | null) {
    super(
      createVectorQueryErrorDescriptor(
        "VECTOR_STORE_CONNECTION_NOT_FOUND",
        "configuration",
        "The vector store connection could not be found.",
        id ? `Vector store connection ${id} not found.` : "Vector store connection not found.",
      ),
      correlationId,
    );
  }
}

export class VectorCollectionNotFoundError extends VectorQueryDomainError {
  constructor(id?: string, correlationId?: string | null) {
    super(
      createVectorQueryErrorDescriptor(
        "VECTOR_COLLECTION_NOT_FOUND",
        "configuration",
        "The vector collection could not be found.",
        id ? `Vector collection ${id} not found.` : "Vector collection not found.",
      ),
      correlationId,
    );
  }
}

export class SearchPolicyNotFoundError extends VectorQueryDomainError {
  constructor(id?: string, correlationId?: string | null) {
    super(
      createVectorQueryErrorDescriptor(
        "SEARCH_POLICY_NOT_FOUND",
        "policy",
        "The search policy could not be found.",
        id ? `Search policy ${id} not found.` : "Search policy not found.",
      ),
      correlationId,
    );
  }
}

export class QueryExecutionNotFoundError extends VectorQueryDomainError {
  constructor(id?: string, correlationId?: string | null) {
    super(
      createVectorQueryErrorDescriptor(
        "QUERY_EXECUTION_NOT_FOUND",
        "repository",
        "The query execution could not be found.",
        id ? `Query execution ${id} not found.` : "Query execution not found.",
      ),
      correlationId,
    );
  }
}

export class KnowledgeEmbeddingNotFoundError extends VectorQueryDomainError {
  constructor(id?: string, correlationId?: string | null) {
    super(
      createVectorQueryErrorDescriptor(
        "KNOWLEDGE_EMBEDDING_NOT_FOUND",
        "validation",
        "The query embedding could not be found.",
        id ? `Knowledge embedding ${id} not found.` : "Knowledge embedding not found.",
      ),
      correlationId,
    );
  }
}

export class IndexedVectorNotFoundError extends VectorQueryDomainError {
  constructor(id?: string, correlationId?: string | null) {
    super(
      createVectorQueryErrorDescriptor(
        "INDEXED_VECTOR_NOT_FOUND",
        "repository",
        "The indexed vector could not be found.",
        id ? `Indexed vector ${id} not found.` : "Indexed vector not found.",
      ),
      correlationId,
    );
  }
}

export class UnsupportedVectorQueryProviderError extends VectorQueryDomainError {
  constructor(key: string, correlationId?: string | null) {
    super(
      createVectorQueryErrorDescriptor(
        "UNSUPPORTED_VECTOR_QUERY_PROVIDER",
        "provider",
        "This vector query provider is not supported.",
        `Vector query provider ${key} does not have an adapter implementation.`,
      ),
      correlationId,
    );
  }
}

export class VectorQueryConfigurationError extends VectorQueryDomainError {
  constructor(message: string, correlationId?: string | null) {
    super(
      createVectorQueryErrorDescriptor(
        "VECTOR_QUERY_CONFIGURATION_ERROR",
        "configuration",
        "Vector query configuration is invalid.",
        message,
        true,
      ),
      correlationId,
    );
  }
}

export class PermissionDeniedError extends VectorQueryDomainError {
  constructor(permission: string, correlationId?: string | null) {
    super(
      createVectorQueryErrorDescriptor(
        "PERMISSION_DENIED",
        "authorization",
        "You do not have permission to perform this vector query action.",
        `Missing required permission: ${permission}`,
      ),
      correlationId,
    );
  }
}

export class ValidationError extends VectorQueryDomainError {
  constructor(message: string, correlationId?: string | null) {
    super(
      createVectorQueryErrorDescriptor(
        "VALIDATION_ERROR",
        "validation",
        "The vector query request is invalid.",
        message,
        true,
      ),
      correlationId,
    );
  }
}

export class NormalizationError extends VectorQueryDomainError {
  constructor(message: string, correlationId?: string | null) {
    super(
      createVectorQueryErrorDescriptor(
        "NORMALIZATION_ERROR",
        "normalization",
        "Vector query results could not be normalized.",
        message,
      ),
      correlationId,
    );
  }
}

export class RankingError extends VectorQueryDomainError {
  constructor(message: string, correlationId?: string | null) {
    super(
      createVectorQueryErrorDescriptor(
        "RANKING_ERROR",
        "ranking",
        "Vector query results could not be ranked.",
        message,
      ),
      correlationId,
    );
  }
}

/** @deprecated Use VectorQueryDomainError */
export class VectorQueryError extends VectorQueryDomainError {
  constructor(code: string, message: string, correlationId?: string | null) {
    super(
      createVectorQueryErrorDescriptor(code, "repository", message, message),
      correlationId,
    );
  }
}
