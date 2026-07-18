export class AIExecutionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AIExecutionError";
    this.code = code;
  }
}

export class AIExecutionNotFoundError extends AIExecutionError {
  constructor(id?: string) {
    super("AI_EXECUTION_NOT_FOUND", id ? `AI execution ${id} not found.` : "AI execution not found.");
  }
}

export class AIExecutionMetricsNotFoundError extends AIExecutionError {
  constructor(id?: string) {
    super(
      "AI_EXECUTION_METRICS_NOT_FOUND",
      id ? `AI execution metrics ${id} not found.` : "AI execution metrics not found.",
    );
  }
}

export class PromptBuildNotFoundError extends AIExecutionError {
  constructor(id?: string) {
    super("PROMPT_BUILD_NOT_FOUND", id ? `Prompt build ${id} not found.` : "Prompt build not found.");
  }
}

export class ProviderConnectionNotFoundError extends AIExecutionError {
  constructor(id?: string) {
    super(
      "PROVIDER_CONNECTION_NOT_FOUND",
      id ? `Provider connection ${id} not found.` : "Provider connection not found.",
    );
  }
}

export class ProviderConnectionDisabledError extends AIExecutionError {
  constructor(id: string) {
    super("PROVIDER_CONNECTION_DISABLED", `Provider connection ${id} is disabled.`);
  }
}

export class AIExecutionCancelledError extends AIExecutionError {
  constructor() {
    super("AI_EXECUTION_CANCELLED", "AI execution was cancelled.");
  }
}

export class AIExecutionTimeoutError extends AIExecutionError {
  constructor(timeoutMs: number) {
    super("AI_EXECUTION_TIMEOUT", `AI execution timed out after ${timeoutMs}ms.`);
  }
}

export class PermissionDeniedError extends AIExecutionError {
  constructor(permission: string) {
    super("PERMISSION_DENIED", `Missing required permission: ${permission}`);
  }
}

export class ValidationError extends AIExecutionError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
  }
}
