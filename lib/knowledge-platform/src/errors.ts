export class KnowledgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "KnowledgeError";
    this.code = code;
  }
}

export class KnowledgeSourceNotFoundError extends KnowledgeError {
  constructor(id?: string) {
    super("KNOWLEDGE_SOURCE_NOT_FOUND", id ? `Knowledge source ${id} not found.` : "Knowledge source not found.");
  }
}

export class KnowledgeDocumentNotFoundError extends KnowledgeError {
  constructor(id?: string) {
    super("KNOWLEDGE_DOCUMENT_NOT_FOUND", id ? `Knowledge document ${id} not found.` : "Knowledge document not found.");
  }
}

export class KnowledgeVersionNotFoundError extends KnowledgeError {
  constructor(id?: string) {
    super("KNOWLEDGE_VERSION_NOT_FOUND", id ? `Knowledge version ${id} not found.` : "Knowledge version not found.");
  }
}

export class KnowledgeSectionNotFoundError extends KnowledgeError {
  constructor(id?: string) {
    super("KNOWLEDGE_SECTION_NOT_FOUND", id ? `Knowledge section ${id} not found.` : "Knowledge section not found.");
  }
}

export class KnowledgeChunkNotFoundError extends KnowledgeError {
  constructor(id?: string) {
    super("KNOWLEDGE_CHUNK_NOT_FOUND", id ? `Knowledge chunk ${id} not found.` : "Knowledge chunk not found.");
  }
}

export class KnowledgeSourceDisabledError extends KnowledgeError {
  constructor(id: string) {
    super("KNOWLEDGE_SOURCE_DISABLED", `Knowledge source ${id} is disabled.`);
  }
}

export class ImmutableVersionError extends KnowledgeError {
  constructor(versionId: string) {
    super("IMMUTABLE_VERSION", `Knowledge version ${versionId} is immutable and cannot be modified.`);
  }
}

export class PermissionDeniedError extends KnowledgeError {
  constructor(permission: string) {
    super("PERMISSION_DENIED", `Missing required permission: ${permission}`);
  }
}

export class ValidationError extends KnowledgeError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
  }
}

export class DuplicateKnowledgeSourceError extends KnowledgeError {
  constructor(key: string) {
    super("DUPLICATE_KNOWLEDGE_SOURCE", `Knowledge source key ${key} already exists.`);
  }
}

export class KnowledgeParseError extends KnowledgeError {
  constructor(message: string) {
    super("KNOWLEDGE_PARSE_ERROR", message);
  }
}
