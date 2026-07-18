export class IntentEngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "IntentEngineError";
    this.code = code;
  }
}

export class IntentNotFoundError extends IntentEngineError {
  constructor(key?: string) {
    super("INTENT_NOT_FOUND", key ? `Intent ${key} not found.` : "Intent not found.");
  }
}

export class IntentDisabledError extends IntentEngineError {
  constructor(key: string) {
    super("INTENT_DISABLED", `Intent ${key} is disabled.`);
  }
}

export class IntentStateNotSupportedError extends IntentEngineError {
  constructor(key: string, state: string) {
    super("INTENT_STATE_NOT_SUPPORTED", `Intent ${key} does not support conversation state ${state}.`);
  }
}

export class IntentMatchNotFoundError extends IntentEngineError {
  constructor(id?: string) {
    super("INTENT_MATCH_NOT_FOUND", id ? `Intent match ${id} not found.` : "Intent match not found.");
  }
}

export class PermissionDeniedError extends IntentEngineError {
  constructor(permission: string) {
    super("PERMISSION_DENIED", `Missing required permission: ${permission}`);
  }
}

export class ConversationAccessDeniedError extends IntentEngineError {
  constructor(conversationId?: string) {
    super(
      "CONVERSATION_ACCESS_DENIED",
      conversationId ? `Access denied for conversation ${conversationId}.` : "Conversation access denied.",
    );
  }
}

export class ConversationNotFoundError extends IntentEngineError {
  constructor(conversationId?: string) {
    super(
      "CONVERSATION_NOT_FOUND",
      conversationId ? `Conversation ${conversationId} not found.` : "Conversation not found.",
    );
  }
}

export class ClassifierNotImplementedError extends IntentEngineError {
  constructor(classifierKey: string) {
    super("CLASSIFIER_NOT_IMPLEMENTED", `Classifier ${classifierKey} is not implemented.`);
  }
}
