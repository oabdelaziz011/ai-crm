export class BranchManagementError extends Error {
  constructor(
    message: string,
    readonly code:
      | "duplicate_code"
      | "has_dependencies"
      | "not_found"
      | "primary_conflict"
      | "validation",
  ) {
    super(message);
    this.name = "BranchManagementError";
  }
}
