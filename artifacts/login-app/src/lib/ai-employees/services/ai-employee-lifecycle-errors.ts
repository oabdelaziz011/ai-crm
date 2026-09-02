export class AiEmployeeLifecycleError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "invalid_state"
      | "validation"
      | "permission"
      | "delete_blocked"
      | "archive_blocked",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AiEmployeeLifecycleError";
  }
}
