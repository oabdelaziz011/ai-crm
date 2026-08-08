export class ChannelPlatformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannelPlatformError";
  }
}

export class PermissionDeniedError extends ChannelPlatformError {
  constructor(permission: string) {
    super(`Permission denied: ${permission}`);
    this.name = "PermissionDeniedError";
  }
}

export class ValidationError extends ChannelPlatformError {
  readonly metaErrorCode?: number;
  readonly metaErrorSubcode?: number;

  constructor(
    message: string,
    options?: { metaErrorCode?: number; metaErrorSubcode?: number },
  ) {
    super(message);
    this.name = "ValidationError";
    this.metaErrorCode = options?.metaErrorCode;
    this.metaErrorSubcode = options?.metaErrorSubcode;
  }
}

export class ChannelAdapterNotFoundError extends ChannelPlatformError {
  constructor(channelKey: string) {
    super(`No channel adapter registered for key: ${channelKey}`);
    this.name = "ChannelAdapterNotFoundError";
  }
}

export class DuplicateInboundEventError extends ChannelPlatformError {
  constructor(idempotencyKey: string) {
    super(`Duplicate inbound event: ${idempotencyKey}`);
    this.name = "DuplicateInboundEventError";
  }
}

export class CompanyChannelNotFoundError extends ChannelPlatformError {
  constructor(companyChannelId: string) {
    super(`Company channel not found: ${companyChannelId}`);
    this.name = "CompanyChannelNotFoundError";
  }
}

export class DeliveryFailedError extends ChannelPlatformError {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryFailedError";
  }
}
