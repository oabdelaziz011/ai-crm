export class QuoteValidationError extends Error {
  readonly code = "QUOTE_VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "QuoteValidationError";
  }
}

export class QuoteNotFoundError extends Error {
  readonly code = "QUOTE_NOT_FOUND";
  constructor(id: string) {
    super(`Quote not found: ${id}`);
    this.name = "QuoteNotFoundError";
  }
}

export class QuotePermissionError extends Error {
  readonly code = "QUOTE_PERMISSION";
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "QuotePermissionError";
  }
}
