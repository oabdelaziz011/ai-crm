export class ProductDemoError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProductDemoError";
    this.code = code;
  }
}

export class ProductDemoPermissionError extends ProductDemoError {
  constructor(permission: string) {
    super("PERMISSION_DENIED", `Missing permission: ${permission}`);
    this.name = "ProductDemoPermissionError";
  }
}

export class ProductDemoValidationError extends ProductDemoError {
  constructor(message: string, code = "VALIDATION") {
    super(code, message);
    this.name = "ProductDemoValidationError";
  }
}

export class ProductDemoConflictError extends ProductDemoError {
  constructor(message: string, code = "CONFLICT") {
    super(code, message);
    this.name = "ProductDemoConflictError";
  }
}
