export class AIProviderError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AIProviderError";
    this.code = code;
  }
}

export class AIProviderNotFoundError extends AIProviderError {
  constructor(key?: string) {
    super("AI_PROVIDER_NOT_FOUND", key ? `AI provider ${key} not found.` : "AI provider not found.");
  }
}

export class AIProviderConnectionNotFoundError extends AIProviderError {
  constructor(id?: string) {
    super(
      "AI_PROVIDER_CONNECTION_NOT_FOUND",
      id ? `AI provider connection ${id} not found.` : "AI provider connection not found.",
    );
  }
}

export class AIProviderDisabledError extends AIProviderError {
  constructor(key: string) {
    super("AI_PROVIDER_DISABLED", `AI provider ${key} is disabled.`);
  }
}

export class UnsupportedAIProviderError extends AIProviderError {
  constructor(key: string) {
    super("UNSUPPORTED_AI_PROVIDER", `AI provider ${key} does not have an adapter implementation.`);
  }
}

export class AIProviderConfigurationError extends AIProviderError {
  constructor(message: string) {
    super("AI_PROVIDER_CONFIGURATION_ERROR", message);
  }
}

export class PermissionDeniedError extends AIProviderError {
  constructor(permission: string) {
    super("PERMISSION_DENIED", `Missing required permission: ${permission}`);
  }
}

export class ValidationError extends AIProviderError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
  }
}

export class AIProviderRequestError extends AIProviderError {
  constructor(message: string) {
    super("AI_PROVIDER_REQUEST_ERROR", message);
  }
}

export class AIProviderTimeoutError extends AIProviderError {
  constructor(message: string) {
    super("AI_PROVIDER_TIMEOUT", message);
  }
}
