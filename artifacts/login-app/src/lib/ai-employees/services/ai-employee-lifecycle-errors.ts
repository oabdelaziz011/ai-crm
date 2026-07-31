export class AiEmployeeLifecycleError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "invalid_state" | "validation" | "permission",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AiEmployeeLifecycleError";
  }
}
