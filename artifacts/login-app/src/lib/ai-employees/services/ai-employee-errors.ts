export class AiEmployeeRegistryError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "duplicate_name" | "validation",
  ) {
    super(message);
    this.name = "AiEmployeeRegistryError";
  }
}
