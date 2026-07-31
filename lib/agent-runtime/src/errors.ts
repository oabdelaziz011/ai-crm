export class AgentRuntimeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentRuntimeError";
    this.code = code;
  }
}

export class AgentsFeatureDisabledError extends AgentRuntimeError {
  constructor() {
    super("AGENTS_FEATURE_DISABLED", "AI Agents is disabled for this company.");
  }
}

export class AgentsPermissionDeniedError extends AgentRuntimeError {
  readonly permission: string;

  constructor(permission: string) {
    super("AGENTS_PERMISSION_DENIED", `Permission denied: ${permission} required for AI Agents.`);
    this.permission = permission;
  }
}
