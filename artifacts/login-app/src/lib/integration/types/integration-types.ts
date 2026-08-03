import type {
  ApiScope,
  AuthType,
  ConnectorType,
  IntegrationHealthStatus,
  OAuthGrantType,
  WebhookDeliveryStatus,
  WebhookEventType,
} from "@/lib/integration/types/integration-enums";

export type IntegrationApiKey = {
  id: string;
  companyId: string;
  name: string;
  keyPrefix: string;
  scopes: ApiScope[];
  ipAllowlist: string[];
  isActive: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
};

export type CreateApiKeyInput = {
  companyId: string;
  name: string;
  scopes: ApiScope[];
  ipAllowlist?: string[];
  expiresAt?: string;
  createdBy?: string;
};

export type CreateApiKeyResult = {
  key: IntegrationApiKey;
  secret: string;
};

export type OAuthClient = {
  id: string;
  companyId: string;
  name: string;
  clientId: string;
  redirectUris: string[];
  grantTypes: OAuthGrantType[];
  scopes: ApiScope[];
  isConfidential: boolean;
  isActive: boolean;
  createdAt: string;
};

export type WebhookSubscription = {
  id: string;
  companyId: string;
  name: string;
  endpointUrl: string;
  eventTypes: WebhookEventType[];
  isActive: boolean;
  isPaused: boolean;
  failureCount: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  createdAt: string;
};

export type WebhookDelivery = {
  id: string;
  companyId: string;
  subscriptionId: string;
  eventType: WebhookEventType;
  eventId: string;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  responseStatus: number | null;
  deliveredAt: string | null;
  createdAt: string;
};

export type IntegrationConnector = {
  id: string;
  companyId: string;
  connectorType: ConnectorType;
  name: string;
  config: Record<string, unknown>;
  isActive: boolean;
  healthStatus: IntegrationHealthStatus;
  lastSyncAt: string | null;
};

export type IntegrationEvent = {
  id: string;
  companyId: string;
  eventType: WebhookEventType;
  eventId: string;
  sourcePlatform: string;
  payload: Record<string, unknown>;
  publishedAt: string;
};

export type ApiAuditEntry = {
  id: string;
  companyId: string;
  authType: AuthType;
  method: string;
  path: string;
  apiVersion: string;
  statusCode: number;
  latencyMs: number | null;
  createdAt: string;
};

export type IntegrationOverview = {
  apiKeyCount: number;
  oauthClientCount: number;
  webhookSubscriptionCount: number;
  connectorCount: number;
  pendingDeliveries: number;
  failedDeliveries24h: number;
  apiCalls24h: number;
  avgLatencyMs: number;
};

export type IntegrationMonitoring = {
  topEndpoints: Array<{ path: string; count: number }>;
  topClients: Array<{ name: string; count: number }>;
  errorRate: number;
  webhookSuccessRate: number;
};

export type ApiAuthContext = {
  companyId: string;
  authType: AuthType;
  authId: string;
  scopes: ApiScope[];
  ipAddress?: string;
  userId?: string | null;
  isSuperAdmin?: boolean;
};

export type PaginatedResult<T> = {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
  total?: number;
};

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "DEPRECATED_VERSION";

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
};
