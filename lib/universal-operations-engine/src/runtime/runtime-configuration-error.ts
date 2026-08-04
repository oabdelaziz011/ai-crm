/** Thrown when published operations configuration is missing or incomplete at runtime. */
export class OperationsRuntimeConfigurationError extends Error {
  readonly code = "OPERATIONS_RUNTIME_CONFIGURATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "OperationsRuntimeConfigurationError";
  }
}
