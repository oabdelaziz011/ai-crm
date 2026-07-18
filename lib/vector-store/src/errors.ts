export class VectorStoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "VectorStoreError";
    this.code = code;
  }
}

export class VectorStoreProviderNotFoundError extends VectorStoreError {
  constructor(key?: string) {
    super(
      "VECTOR_STORE_PROVIDER_NOT_FOUND",
      key ? `Vector store provider ${key} not found.` : "Vector store provider not found.",
    );
  }
}

export class VectorStoreConnectionNotFoundError extends VectorStoreError {
  constructor(id?: string) {
    super(
      "VECTOR_STORE_CONNECTION_NOT_FOUND",
      id ? `Vector store connection ${id} not found.` : "Vector store connection not found.",
    );
  }
}

export class VectorStoreProviderDisabledError extends VectorStoreError {
  constructor(key: string) {
    super("VECTOR_STORE_PROVIDER_DISABLED", `Vector store provider ${key} is disabled.`);
  }
}

export class UnsupportedVectorStoreProviderError extends VectorStoreError {
  constructor(key: string) {
    super("UNSUPPORTED_VECTOR_STORE_PROVIDER", `Vector store provider ${key} does not have an adapter implementation.`);
  }
}

export class VectorStoreConfigurationError extends VectorStoreError {
  constructor(message: string) {
    super("VECTOR_STORE_CONFIGURATION_ERROR", message);
  }
}

export class VectorCollectionNotFoundError extends VectorStoreError {
  constructor(id?: string) {
    super("VECTOR_COLLECTION_NOT_FOUND", id ? `Vector collection ${id} not found.` : "Vector collection not found.");
  }
}

export class IndexedVectorNotFoundError extends VectorStoreError {
  constructor(id?: string) {
    super("INDEXED_VECTOR_NOT_FOUND", id ? `Indexed vector ${id} not found.` : "Indexed vector not found.");
  }
}

export class KnowledgeEmbeddingNotFoundError extends VectorStoreError {
  constructor(id?: string) {
    super(
      "KNOWLEDGE_EMBEDDING_NOT_FOUND",
      id ? `Knowledge embedding ${id} not found.` : "Knowledge embedding not found.",
    );
  }
}

export class PermissionDeniedError extends VectorStoreError {
  constructor(permission: string) {
    super("PERMISSION_DENIED", `Missing required permission: ${permission}`);
  }
}

export class ValidationError extends VectorStoreError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
  }
}
