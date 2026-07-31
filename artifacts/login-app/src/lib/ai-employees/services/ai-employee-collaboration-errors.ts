export class AiEmployeeCollaborationError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "policy" | "invalid_state",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AiEmployeeCollaborationError";
  }
}

export function formatAiEmployeeCollaborationError(error: unknown): string {
  if (error instanceof AiEmployeeCollaborationError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected collaboration error occurred";
}
