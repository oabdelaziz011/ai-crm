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

export class AgentCrmToolPermissionDeniedError extends AgentRuntimeError {
  readonly toolKey: string;
  readonly permission: string;

  constructor(toolKey: string, permission: string) {
    super(
      "AGENT_CRM_TOOL_PERMISSION_DENIED",
      `Permission denied: ${permission} required for CRM agent tool "${toolKey}".`,
    );
    this.toolKey = toolKey;
    this.permission = permission;
  }
}

export class AgentCheckpointRecoveryError extends AgentRuntimeError {
  readonly recoveryCode: string;

  constructor(code: string, message: string) {
    super(code, message);
    this.recoveryCode = code;
  }
}

export class AgentExecutionLeaseError extends AgentRuntimeError {
  readonly leaseCode: string;

  constructor(code: string, message: string) {
    super(code, message);
    this.leaseCode = code;
  }
}

export class AgentKnowledgeRetrievalError extends AgentRuntimeError {
  readonly retrievalCode: string;

  constructor(code: string, message: string) {
    super(code, message);
    this.retrievalCode = code;
  }
}

export class AgentConfirmationError extends AgentRuntimeError {
  readonly confirmationCode: string;

  constructor(code: string, message: string) {
    super(code, message);
    this.confirmationCode = code;
  }
}
