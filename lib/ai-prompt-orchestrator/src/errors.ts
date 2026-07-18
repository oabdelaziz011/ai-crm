export class PromptOrchestratorError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PromptOrchestratorError";
    this.code = code;
  }
}

export class PromptTemplateNotFoundError extends PromptOrchestratorError {
  constructor(key?: string) {
    super("PROMPT_TEMPLATE_NOT_FOUND", key ? `Prompt template ${key} not found.` : "Prompt template not found.");
  }
}

export class PromptTemplateVersionNotFoundError extends PromptOrchestratorError {
  constructor(id?: string) {
    super(
      "PROMPT_TEMPLATE_VERSION_NOT_FOUND",
      id ? `Prompt template version ${id} not found.` : "Prompt template version not found.",
    );
  }
}

export class PromptTemplateDisabledError extends PromptOrchestratorError {
  constructor(key: string) {
    super("PROMPT_TEMPLATE_DISABLED", `Prompt template ${key} is disabled.`);
  }
}

export class PermissionDeniedError extends PromptOrchestratorError {
  constructor(permission: string) {
    super("PERMISSION_DENIED", `Missing required permission: ${permission}`);
  }
}

export class ValidationError extends PromptOrchestratorError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
  }
}
