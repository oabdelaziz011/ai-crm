export const RUNTIME_ERROR_CATEGORIES = [
  "validation",
  "authorization",
  "conversation",
  "intent",
  "retrieval",
  "prompt",
  "execution",
  "provider",
  "runtime",
  "telemetry",
  "repository",
  "persistence",
] as const;

export type RuntimeErrorCategory = (typeof RUNTIME_ERROR_CATEGORIES)[number];

export type RuntimeErrorDescriptor = {
  code: string;
  category: RuntimeErrorCategory;
  humanMessage: string;
  developerMessage: string;
  recoverable: boolean;
};

export type RuntimeNormalizedError = RuntimeErrorDescriptor & {
  correlationId: string | null;
};

export function createRuntimeErrorDescriptor(
  code: string,
  category: RuntimeErrorCategory,
  humanMessage: string,
  developerMessage?: string,
  recoverable = false,
): RuntimeErrorDescriptor {
  return {
    code,
    category,
    humanMessage,
    developerMessage: developerMessage ?? humanMessage,
    recoverable,
  };
}

export class RuntimeErrorCatalogService {
  normalize(error: unknown, correlationId?: string | null): RuntimeNormalizedError {
    if (error instanceof RuntimeDomainError) {
      return {
        code: error.code,
        category: error.category,
        humanMessage: error.humanMessage,
        developerMessage: error.developerMessage,
        correlationId: error.correlationId ?? correlationId ?? null,
        recoverable: error.recoverable,
      };
    }

    if (error instanceof Error) {
      return {
        code: "RUNTIME_UNKNOWN",
        category: "runtime",
        humanMessage: "Runtime execution failed.",
        developerMessage: error.message,
        correlationId: correlationId ?? null,
        recoverable: false,
      };
    }

    if (error && typeof error === "object") {
      const record = error as { message?: unknown; error?: unknown; code?: unknown };
      const message =
        typeof record.message === "string" && record.message.trim()
          ? record.message.trim()
          : typeof record.error === "string" && record.error.trim()
            ? record.error.trim()
            : null;
      if (message) {
        return {
          code: "RUNTIME_UNKNOWN",
          category: "runtime",
          humanMessage: "Runtime execution failed.",
          developerMessage: message,
          correlationId: correlationId ?? null,
          recoverable: false,
        };
      }
    }

    return {
      code: "RUNTIME_UNKNOWN",
      category: "runtime",
      humanMessage: "Runtime execution failed.",
      developerMessage: "Unknown runtime error.",
      correlationId: correlationId ?? null,
      recoverable: false,
    };
  }
}

export class RuntimeDomainError extends Error {
  readonly code: string;
  readonly category: RuntimeErrorCategory;
  readonly humanMessage: string;
  readonly developerMessage: string;
  readonly correlationId: string | null;
  readonly recoverable: boolean;

  constructor(descriptor: RuntimeErrorDescriptor, correlationId?: string | null) {
    super(descriptor.developerMessage);
    this.name = "RuntimeDomainError";
    this.code = descriptor.code;
    this.category = descriptor.category;
    this.humanMessage = descriptor.humanMessage;
    this.developerMessage = descriptor.developerMessage;
    this.correlationId = correlationId ?? null;
    this.recoverable = descriptor.recoverable;
  }
}

export class PermissionDeniedError extends RuntimeDomainError {
  constructor(permission: string, correlationId?: string | null) {
    super(
      createRuntimeErrorDescriptor(
        "PERMISSION_DENIED",
        "authorization",
        "You do not have permission to perform this runtime action.",
        `Missing required permission: ${permission}`,
      ),
      correlationId,
    );
  }
}

export class ValidationError extends RuntimeDomainError {
  constructor(message: string, correlationId?: string | null) {
    super(
      createRuntimeErrorDescriptor(
        "VALIDATION_ERROR",
        "validation",
        "The runtime request is invalid.",
        message,
        true,
      ),
      correlationId,
    );
  }
}

export class ConversationNotFoundError extends RuntimeDomainError {
  constructor(id?: string, correlationId?: string | null) {
    super(
      createRuntimeErrorDescriptor(
        "CONVERSATION_NOT_FOUND",
        "conversation",
        "The conversation could not be found.",
        id ? `Conversation ${id} not found.` : "Conversation not found.",
      ),
      correlationId,
    );
  }
}

export class RuntimePolicyNotFoundError extends RuntimeDomainError {
  constructor(id?: string, correlationId?: string | null) {
    super(
      createRuntimeErrorDescriptor(
        "RUNTIME_POLICY_NOT_FOUND",
        "runtime",
        "The runtime policy could not be found.",
        id ? `Runtime policy ${id} not found.` : "Runtime policy not found.",
      ),
      correlationId,
    );
  }
}

export class RuntimeExecutionNotFoundError extends RuntimeDomainError {
  constructor(id?: string, correlationId?: string | null) {
    super(
      createRuntimeErrorDescriptor(
        "RUNTIME_EXECUTION_NOT_FOUND",
        "repository",
        "The runtime execution could not be found.",
        id ? `Runtime execution ${id} not found.` : "Runtime execution not found.",
      ),
      correlationId,
    );
  }
}

export class PipelineStageError extends RuntimeDomainError {
  constructor(stage: string, message: string, category: RuntimeErrorCategory, correlationId?: string | null) {
    super(
      createRuntimeErrorDescriptor(
        "PIPELINE_STAGE_FAILED",
        category,
        `Runtime pipeline failed during ${stage}.`,
        message,
      ),
      correlationId,
    );
  }
}
