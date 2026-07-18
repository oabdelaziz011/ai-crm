export class ConversationDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ConversationDomainError";
    this.code = code;
  }
}

export class ConversationNotFoundError extends ConversationDomainError {
  constructor(id?: string) {
    super("CONVERSATION_NOT_FOUND", id ? `Conversation ${id} not found.` : "Conversation not found.");
  }
}

export class ParticipantNotFoundError extends ConversationDomainError {
  constructor(id?: string) {
    super("PARTICIPANT_NOT_FOUND", id ? `Participant ${id} not found.` : "Participant not found.");
  }
}

export class PermissionDeniedError extends ConversationDomainError {
  constructor(permission: string) {
    super("PERMISSION_DENIED", `Missing required permission: ${permission}`);
  }
}

export class ValidationError extends ConversationDomainError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
  }
}

export class DuplicateExternalMessageError extends ConversationDomainError {
  constructor(externalMessageId: string) {
    super("DUPLICATE_EXTERNAL_MESSAGE", `Message with external id ${externalMessageId} already exists.`);
  }
}

export class InvalidStateTransitionError extends ConversationDomainError {
  readonly fromState: string;
  readonly trigger: string;

  constructor(fromState: string, trigger: string, message?: string) {
    super(
      "INVALID_STATE_TRANSITION",
      message ?? `Invalid state transition from "${fromState}" using trigger "${trigger}".`,
    );
    this.fromState = fromState;
    this.trigger = trigger;
  }
}

export class ConversationStateConflictError extends ConversationDomainError {
  constructor(expectedState: string, actualState?: string) {
    super(
      "CONVERSATION_STATE_CONFLICT",
      actualState
        ? `Conversation state changed unexpectedly. Expected "${expectedState}" but found "${actualState}".`
        : `Conversation state conflict while applying transition from "${expectedState}".`,
    );
  }
}
