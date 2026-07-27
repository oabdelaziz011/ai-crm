export class ToolRouterError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolRouterError";
    this.code = code;
  }
}

export class ToolNotFoundError extends ToolRouterError {
  constructor(key?: string) {
    super("TOOL_NOT_FOUND", key ? `Tool ${key} not found.` : "Tool not found.");
  }
}

export class ToolDisabledError extends ToolRouterError {
  constructor(key: string) {
    super("TOOL_DISABLED", `Tool ${key} is disabled.`);
  }
}

export class ToolHandlerNotFoundError extends ToolRouterError {
  constructor(key: string) {
    super("TOOL_HANDLER_NOT_FOUND", `No handler registered for tool ${key}.`);
  }
}

export class ToolStateNotSupportedError extends ToolRouterError {
  constructor(key: string, state: string) {
    super("TOOL_STATE_NOT_SUPPORTED", `Tool ${key} does not support conversation state ${state}.`);
  }
}

export class ToolInputValidationError extends ToolRouterError {
  constructor(message: string) {
    super("TOOL_INPUT_VALIDATION", message);
  }
}

export class ToolExecutionNotFoundError extends ToolRouterError {
  constructor(id?: string) {
    super("TOOL_EXECUTION_NOT_FOUND", id ? `Tool execution ${id} not found.` : "Tool execution not found.");
  }
}

export class PermissionDeniedError extends ToolRouterError {
  constructor(permission: string) {
    super("PERMISSION_DENIED", `Missing required permission: ${permission}`);
  }
}

export class ConversationAccessDeniedError extends ToolRouterError {
  constructor(conversationId?: string) {
    super(
      "CONVERSATION_ACCESS_DENIED",
      conversationId ? `Access denied for conversation ${conversationId}.` : "Conversation access denied.",
    );
  }
}

export class ConversationNotFoundError extends ToolRouterError {
  constructor(conversationId?: string) {
    super(
      "CONVERSATION_NOT_FOUND",
      conversationId ? `Conversation ${conversationId} not found.` : "Conversation not found.",
    );
  }
}

export class TenantContextMissingError extends ToolRouterError {
  constructor() {
    super("TENANT_CONTEXT_MISSING", "Tool execution requires tenant context (companyId and userId).");
  }
}
