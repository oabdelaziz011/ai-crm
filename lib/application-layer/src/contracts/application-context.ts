export type ActorType = "user" | "system" | "ai";

/** Immutable execution context propagated through every command and query. */
export type ApplicationContext = Readonly<{
  tenantId: string;
  workspaceId?: string;
  actorId: string;
  actorType: ActorType;
  correlationId: string;
  idempotencyKey?: string;
  locale: string;
  permissions: readonly string[];
  featureFlags: Readonly<Record<string, boolean>>;
}>;

export type AuditContext = Readonly<{
  tenantId: string;
  actorId: string;
  correlationId: string;
  commandType: string;
  occurredAt: string;
}>;

export type CommandResult<TResponse> = Readonly<{
  data: TResponse;
  correlationId: string;
  eventIds: readonly string[];
}>;

export type QueryResult<TResponse> = Readonly<{
  data: TResponse;
  correlationId: string;
  cached: boolean;
}>;

export type CommandHandler<TRequest, TResponse> = {
  readonly commandType: string;
  readonly requiredPermissions: readonly string[];
  handle(request: TRequest, context: ApplicationContext): Promise<TResponse>;
};

export type QueryHandler<TRequest, TResponse> = {
  readonly queryType: string;
  readonly requiredPermissions: readonly string[];
  handle(request: TRequest, context: ApplicationContext): Promise<TResponse>;
};

export function createContext(input: Partial<ApplicationContext> & Pick<ApplicationContext, "tenantId" | "actorId">): ApplicationContext {
  return Object.freeze({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    actorType: input.actorType ?? "user",
    correlationId: input.correlationId ?? crypto.randomUUID(),
    idempotencyKey: input.idempotencyKey,
    locale: input.locale ?? "en",
    permissions: Object.freeze(input.permissions ?? []),
    featureFlags: Object.freeze(input.featureFlags ?? {}),
  });
}
