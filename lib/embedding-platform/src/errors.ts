export class EmbeddingPlatformError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EmbeddingPlatformError";
    this.code = code;
  }
}

export class EmbeddingProviderNotFoundError extends EmbeddingPlatformError {
  constructor(key?: string) {
    super(
      "EMBEDDING_PROVIDER_NOT_FOUND",
      key ? `Embedding provider ${key} not found.` : "Embedding provider not found.",
    );
  }
}

export class EmbeddingProviderConnectionNotFoundError extends EmbeddingPlatformError {
  constructor(id?: string) {
    super(
      "EMBEDDING_PROVIDER_CONNECTION_NOT_FOUND",
      id ? `Embedding provider connection ${id} not found.` : "Embedding provider connection not found.",
    );
  }
}

export class EmbeddingProviderDisabledError extends EmbeddingPlatformError {
  constructor(key: string) {
    super("EMBEDDING_PROVIDER_DISABLED", `Embedding provider ${key} is disabled.`);
  }
}

export class UnsupportedEmbeddingProviderError extends EmbeddingPlatformError {
  constructor(key: string) {
    super("UNSUPPORTED_EMBEDDING_PROVIDER", `Embedding provider ${key} does not have an adapter implementation.`);
  }
}

export class EmbeddingProviderConfigurationError extends EmbeddingPlatformError {
  constructor(message: string) {
    super("EMBEDDING_PROVIDER_CONFIGURATION_ERROR", message);
  }
}

export class EmbeddingNotFoundError extends EmbeddingPlatformError {
  constructor(id?: string) {
    super("EMBEDDING_NOT_FOUND", id ? `Embedding ${id} not found.` : "Embedding not found.");
  }
}

export class EmbeddingJobNotFoundError extends EmbeddingPlatformError {
  constructor(id?: string) {
    super("EMBEDDING_JOB_NOT_FOUND", id ? `Embedding job ${id} not found.` : "Embedding job not found.");
  }
}

export class KnowledgeChunkNotFoundError extends EmbeddingPlatformError {
  constructor(id?: string) {
    super("KNOWLEDGE_CHUNK_NOT_FOUND", id ? `Knowledge chunk ${id} not found.` : "Knowledge chunk not found.");
  }
}

export class EmbeddingChecksumMismatchError extends EmbeddingPlatformError {
  constructor(message = "Embedding checksum validation failed.") {
    super("EMBEDDING_CHECKSUM_MISMATCH", message);
  }
}

export class EmbeddingJobStateError extends EmbeddingPlatformError {
  constructor(message: string) {
    super("EMBEDDING_JOB_STATE_ERROR", message);
  }
}

export class PermissionDeniedError extends EmbeddingPlatformError {
  constructor(permission: string) {
    super("PERMISSION_DENIED", `Missing required permission: ${permission}`);
  }
}

export class ValidationError extends EmbeddingPlatformError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
  }
}

export class EmbeddingProviderRequestError extends EmbeddingPlatformError {
  constructor(message: string) {
    super("EMBEDDING_PROVIDER_REQUEST_ERROR", message);
  }
}

export class EmbeddingProviderTimeoutError extends EmbeddingPlatformError {
  constructor(message: string) {
    super("EMBEDDING_PROVIDER_TIMEOUT", message);
  }
}
