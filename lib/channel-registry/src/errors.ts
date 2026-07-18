export class ChannelRegistryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ChannelRegistryError";
    this.code = code;
  }
}

export class CommunicationChannelNotFoundError extends ChannelRegistryError {
  constructor(idOrKey?: string) {
    super(
      "COMMUNICATION_CHANNEL_NOT_FOUND",
      idOrKey ? `Communication channel ${idOrKey} not found.` : "Communication channel not found.",
    );
  }
}

export class CompanyChannelNotFoundError extends ChannelRegistryError {
  constructor(id?: string) {
    super(
      "COMPANY_CHANNEL_NOT_FOUND",
      id ? `Company channel ${id} not found.` : "Company channel not found.",
    );
  }
}

export class PermissionDeniedError extends ChannelRegistryError {
  constructor(permission: string) {
    super("PERMISSION_DENIED", `Missing required permission: ${permission}`);
  }
}

export class ValidationError extends ChannelRegistryError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
  }
}
