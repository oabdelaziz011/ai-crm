export class AiEmployeeLifecycleError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "invalid_state"
      | "validation"
      | "permission"
      | "delete_blocked"
      | "archive_blocked"
      | "already_archived",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AiEmployeeLifecycleError";
  }
}
