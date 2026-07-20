export class AutomationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AutomationError";
    this.code = code;
  }
}

export class AutomationFlowNotFoundError extends AutomationError {
  constructor(id?: string) {
    super("AUTOMATION_FLOW_NOT_FOUND", id ? `Automation flow ${id} not found.` : "Automation flow not found.");
  }
}

export class AutomationRunNotFoundError extends AutomationError {
  constructor(id?: string) {
    super("AUTOMATION_RUN_NOT_FOUND", id ? `Automation run ${id} not found.` : "Automation run not found.");
  }
}

export class AutomationSessionNotFoundError extends AutomationError {
  constructor(id?: string) {
    super("AUTOMATION_SESSION_NOT_FOUND", id ? `Conversation session ${id} not found.` : "Conversation session not found.");
  }
}

export class PermissionDeniedError extends AutomationError {
  constructor(permission: string) {
    super("PERMISSION_DENIED", `Missing required permission: ${permission}`);
  }
}

export class ValidationError extends AutomationError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
  }
}

export class AutomationFlowStateError extends AutomationError {
  constructor(message: string) {
    super("AUTOMATION_FLOW_STATE_ERROR", message);
  }
}

export class DuplicateAutomationFlowError extends AutomationError {
  constructor(name: string) {
    super("DUPLICATE_AUTOMATION_FLOW", `Automation flow name ${name} already exists for this company.`);
  }
}

export class AutomationExecutionError extends AutomationError {
  constructor(message: string) {
    super("AUTOMATION_EXECUTION_ERROR", message);
  }
}

export class AutomationGraphError extends AutomationError {
  constructor(message: string) {
    super("AUTOMATION_GRAPH_ERROR", message);
  }
}

export class AutomationNodeHandlerNotFoundError extends AutomationError {
  constructor(nodeType: string) {
    super("AUTOMATION_NODE_HANDLER_NOT_FOUND", `No node handler registered for type ${nodeType}.`);
  }
}

export class OrchestratorTriggerNotFoundError extends AutomationError {
  constructor(trigger: string) {
    super("ORCHESTRATOR_TRIGGER_NOT_FOUND", `No active automation flow found for trigger ${trigger}.`);
  }
}

export class SessionExpiredError extends AutomationError {
  constructor(sessionId: string) {
    super("SESSION_EXPIRED", `Conversation session ${sessionId} has expired.`);
  }
}

export class ChannelAdapterError extends AutomationError {
  constructor(message: string) {
    super("CHANNEL_ADAPTER_ERROR", message);
  }
}

export class ChannelProviderError extends AutomationError {
  constructor(message: string) {
    super("CHANNEL_PROVIDER_ERROR", message);
  }
}

export class ChannelProviderNotFoundError extends AutomationError {
  constructor(channel: string) {
    super("CHANNEL_PROVIDER_NOT_FOUND", `No channel provider registered for ${channel}.`);
  }
}

export class TransportDeliveryError extends AutomationError {
  constructor(message: string) {
    super("TRANSPORT_DELIVERY_ERROR", message);
  }
}

export class AutomationFlowVersionNotFoundError extends AutomationError {
  constructor(id?: string) {
    super(
      "AUTOMATION_FLOW_VERSION_NOT_FOUND",
      id ? `Automation flow version ${id} not found.` : "Automation flow version not found.",
    );
  }
}

export class WebhookVerificationError extends AutomationError {
  constructor(message: string) {
    super("WEBHOOK_VERIFICATION_ERROR", message);
  }
}
