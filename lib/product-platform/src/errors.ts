export class ProductValidationError extends Error {
  readonly code = "PRODUCT_VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "ProductValidationError";
  }
}

export class ProductNotFoundError extends Error {
  readonly code = "PRODUCT_NOT_FOUND";
  constructor(id: string) {
    super(`Product not found: ${id}`);
    this.name = "ProductNotFoundError";
  }
}

export class ProductPermissionError extends Error {
  readonly code = "PRODUCT_PERMISSION";
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "ProductPermissionError";
  }
}
