export class AiEmployeeSkillError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "duplicate_key" | "invalid_state" | "validation" | "dependency",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AiEmployeeSkillError";
  }
}

export function formatAiEmployeeSkillError(error: unknown): string {
  if (error instanceof AiEmployeeSkillError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected skill error occurred";
}
