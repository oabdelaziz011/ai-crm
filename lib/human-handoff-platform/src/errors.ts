export class HandoffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandoffError";
  }
}

export class HandoffNotFoundError extends HandoffError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "HandoffNotFoundError";
  }
}

export class HandoffPermissionDeniedError extends HandoffError {
  constructor(permission: string) {
    super(`Permission denied: ${permission}`);
    this.name = "HandoffPermissionDeniedError";
  }
}

export class HandoffValidationError extends HandoffError {
  constructor(message: string) {
    super(message);
    this.name = "HandoffValidationError";
  }
}

export class HandoffConflictError extends HandoffError {
  constructor(message: string) {
    super(message);
    this.name = "HandoffConflictError";
  }
}

export class QueueFullError extends HandoffError {
  constructor(queueId: string) {
    super(`Queue is at maximum capacity: ${queueId}`);
    this.name = "QueueFullError";
  }
}
