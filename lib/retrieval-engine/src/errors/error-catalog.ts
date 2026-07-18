export const RETRIEVAL_ERROR_CATEGORIES = [
  "validation",
  "authorization",
  "configuration",
  "policy",
  "selection",
  "budget",
  "assembly",
  "repository",
  "persistence",
  "telemetry",
] as const;

export type RetrievalErrorCategory = (typeof RETRIEVAL_ERROR_CATEGORIES)[number];

export type RetrievalErrorDescriptor = {
  code: string;
  category: RetrievalErrorCategory;
  humanMessage: string;
  developerMessage: string;
  recoverable: boolean;
};

export type RetrievalNormalizedError = RetrievalErrorDescriptor & {
  correlationId: string | null;
  observabilityCode: string;
};

const OBSERVABILITY_CODE_MAP: Record<RetrievalErrorCategory, string> = {
  validation: "invalid_configuration",
  authorization: "policy_violation",
  configuration: "invalid_configuration",
  policy: "policy_violation",
  selection: "unknown",
  budget: "unknown",
  assembly: "unknown",
  repository: "unknown",
  persistence: "unknown",
  telemetry: "unknown",
};

export function createRetrievalErrorDescriptor(
  code: string,
  category: RetrievalErrorCategory,
  humanMessage: string,
  developerMessage?: string,
  recoverable = false,
): RetrievalErrorDescriptor {
  return {
    code,
    category,
    humanMessage,
    developerMessage: developerMessage ?? humanMessage,
    recoverable,
  };
}

export class RetrievalErrorCatalogService {
  normalize(error: unknown, correlationId?: string | null): RetrievalNormalizedError {
    if (error instanceof RetrievalDomainError) {
      return {
        code: error.code,
        category: error.category,
        humanMessage: error.humanMessage,
        developerMessage: error.developerMessage,
        correlationId: error.correlationId ?? correlationId ?? null,
        recoverable: error.recoverable,
        observabilityCode: OBSERVABILITY_CODE_MAP[error.category],
      };
    }

    if (error instanceof Error) {
      return {
        code: "RETRIEVAL_UNKNOWN",
        category: "repository",
        humanMessage: "Retrieval failed.",
        developerMessage: error.message,
        correlationId: correlationId ?? null,
        recoverable: false,
        observabilityCode: "unknown",
      };
    }

    return {
      code: "RETRIEVAL_UNKNOWN",
      category: "repository",
      humanMessage: "Retrieval failed.",
      developerMessage: "Unknown retrieval error.",
      correlationId: correlationId ?? null,
      recoverable: false,
      observabilityCode: "unknown",
    };
  }
}

export class RetrievalDomainError extends Error {
  readonly code: string;
  readonly category: RetrievalErrorCategory;
  readonly humanMessage: string;
  readonly developerMessage: string;
  readonly correlationId: string | null;
  readonly recoverable: boolean;

  constructor(descriptor: RetrievalErrorDescriptor, correlationId?: string | null) {
    super(descriptor.developerMessage);
    this.name = "RetrievalDomainError";
    this.code = descriptor.code;
    this.category = descriptor.category;
    this.humanMessage = descriptor.humanMessage;
    this.developerMessage = descriptor.developerMessage;
    this.correlationId = correlationId ?? null;
    this.recoverable = descriptor.recoverable;
  }
}

export class PermissionDeniedError extends RetrievalDomainError {
  constructor(permission: string, correlationId?: string | null) {
    super(
      createRetrievalErrorDescriptor(
        "PERMISSION_DENIED",
        "authorization",
        "You do not have permission to perform this retrieval action.",
        `Missing required permission: ${permission}`,
      ),
      correlationId,
    );
  }
}

export class ValidationError extends RetrievalDomainError {
  constructor(message: string, correlationId?: string | null) {
    super(
      createRetrievalErrorDescriptor(
        "VALIDATION_ERROR",
        "validation",
        "The retrieval request is invalid.",
        message,
        true,
      ),
      correlationId,
    );
  }
}

export class RetrievalPolicyNotFoundError extends RetrievalDomainError {
  constructor(id?: string, correlationId?: string | null) {
    super(
      createRetrievalErrorDescriptor(
        "RETRIEVAL_POLICY_NOT_FOUND",
        "policy",
        "The retrieval policy could not be found.",
        id ? `Retrieval policy ${id} not found.` : "Retrieval policy not found.",
      ),
      correlationId,
    );
  }
}

export class RetrievalExecutionNotFoundError extends RetrievalDomainError {
  constructor(id?: string, correlationId?: string | null) {
    super(
      createRetrievalErrorDescriptor(
        "RETRIEVAL_EXECUTION_NOT_FOUND",
        "repository",
        "The retrieval execution could not be found.",
        id ? `Retrieval execution ${id} not found.` : "Retrieval execution not found.",
      ),
      correlationId,
    );
  }
}

export class RetrievalContextNotFoundError extends RetrievalDomainError {
  constructor(id?: string, correlationId?: string | null) {
    super(
      createRetrievalErrorDescriptor(
        "RETRIEVAL_CONTEXT_NOT_FOUND",
        "repository",
        "The retrieval context could not be found.",
        id ? `Retrieval context ${id} not found.` : "Retrieval context not found.",
      ),
      correlationId,
    );
  }
}

export class VectorQueryExecutionNotFoundError extends RetrievalDomainError {
  constructor(id?: string, correlationId?: string | null) {
    super(
      createRetrievalErrorDescriptor(
        "VECTOR_QUERY_EXECUTION_NOT_FOUND",
        "configuration",
        "The vector query execution could not be found.",
        id ? `Vector query execution ${id} not found.` : "Vector query execution not found.",
      ),
      correlationId,
    );
  }
}

export class VectorQueryExecutionNotReadyError extends RetrievalDomainError {
  constructor(id?: string, correlationId?: string | null) {
    super(
      createRetrievalErrorDescriptor(
        "VECTOR_QUERY_EXECUTION_NOT_READY",
        "validation",
        "The vector query execution is not ready for retrieval.",
        id ? `Vector query execution ${id} must be completed before retrieval.` : "Vector query execution must be completed.",
        true,
      ),
      correlationId,
    );
  }
}

export class SelectionError extends RetrievalDomainError {
  constructor(message: string, correlationId?: string | null) {
    super(
      createRetrievalErrorDescriptor(
        "SELECTION_ERROR",
        "selection",
        "Retrieval chunk selection failed.",
        message,
      ),
      correlationId,
    );
  }
}

export class BudgetError extends RetrievalDomainError {
  constructor(message: string, correlationId?: string | null) {
    super(
      createRetrievalErrorDescriptor(
        "BUDGET_ERROR",
        "budget",
        "Retrieval context budget enforcement failed.",
        message,
        true,
      ),
      correlationId,
    );
  }
}

export class AssemblyError extends RetrievalDomainError {
  constructor(message: string, correlationId?: string | null) {
    super(
      createRetrievalErrorDescriptor(
        "ASSEMBLY_ERROR",
        "assembly",
        "Retrieval context assembly failed.",
        message,
      ),
      correlationId,
    );
  }
}
