import type { AiEmployeeDeleteDependencyResult } from "./assert-ai-employee-safe-to-archive";

export class AiEmployeeRegistryError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "duplicate_name"
      | "validation"
      | "invalid_state"
      | "delete_blocked"
      | "archive_blocked"
      | "already_archived",
    readonly details?: AiEmployeeDeleteDependencyResult,
  ) {
    super(message);
    this.name = "AiEmployeeRegistryError";
  }
}
