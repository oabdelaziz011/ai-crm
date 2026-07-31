export class AiEmployeeGovernanceError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "duplicate_key" | "invalid_state" | "policy",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AiEmployeeGovernanceError";
  }
}

export function formatAiEmployeeGovernanceError(error: unknown): string {
  if (error instanceof AiEmployeeGovernanceError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected governance error occurred";
}
