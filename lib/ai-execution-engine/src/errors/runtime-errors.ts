import { AIExecutionError } from "../errors.js";

export class ContextBuildError extends AIExecutionError {
  constructor(message: string) {
    super("CONTEXT_BUILD_ERROR", message);
  }
}

export class PromptValidationError extends AIExecutionError {
  constructor(message: string) {
    super("PROMPT_VALIDATION_ERROR", message);
  }
}

export class PromptRenderError extends AIExecutionError {
  constructor(message: string) {
    super("PROMPT_RENDER_ERROR", message);
  }
}

export class ProviderUnavailableError extends AIExecutionError {
  constructor(providerKey?: string) {
    super("PROVIDER_UNAVAILABLE", providerKey ? `Provider ${providerKey} is unavailable.` : "Provider unavailable.");
  }
}

export class GatewayTimeoutError extends AIExecutionError {
  constructor(timeoutMs: number) {
    super("GATEWAY_TIMEOUT", `Gateway timed out after ${timeoutMs}ms.`);
  }
}

export class TokenBudgetExceededError extends AIExecutionError {
  constructor(message: string) {
    super("TOKEN_BUDGET_EXCEEDED", message);
  }
}

export class PolicyViolationError extends AIExecutionError {
  constructor(message: string) {
    super("POLICY_VIOLATION", message);
  }
}
