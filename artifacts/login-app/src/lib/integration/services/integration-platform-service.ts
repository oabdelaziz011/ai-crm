import type { SupabaseClient } from "@supabase/supabase-js";
import { IntegrationRepository } from "@/lib/integration/repositories/integration-repository";
import { IntegrationApiGatewayService } from "@/lib/integration/api/integration-api-gateway-service";
import { WebhookDeliveryService } from "@/lib/integration/webhooks/webhook-delivery-service";
import { EventBusService } from "@/lib/integration/events/event-bus-service";
import { OAuthService } from "@/lib/integration/oauth/oauth-service";
import { IntegrationMonitoringService } from "@/lib/integration/monitoring/integration-monitoring-service";
import type { ApiAuthContext, ApiScope, CreateApiKeyInput } from "@/lib/integration/types";
import { hashSecret } from "@/lib/integration/webhooks/webhook-signature";
import { validateScopes } from "@/lib/integration/api/scope-validator";
import { apiRateLimiter } from "@/lib/integration/ratelimiting/rate-limiter-service";

/** Main integration platform orchestrator. */
export class IntegrationPlatformService {
  private readonly repo: IntegrationRepository;
  readonly gateway: IntegrationApiGatewayService;
  readonly webhooks: WebhookDeliveryService;
  readonly events: EventBusService;
  readonly oauth: OAuthService;
  readonly monitoring: IntegrationMonitoringService;

  constructor(client: SupabaseClient) {
    this.repo = new IntegrationRepository(client);
    this.gateway = new IntegrationApiGatewayService(client);
    this.webhooks = new WebhookDeliveryService(client);
    this.events = new EventBusService(client, this.webhooks);
    this.oauth = new OAuthService(client, this.repo);
    this.monitoring = new IntegrationMonitoringService(client);
  }

  get keys() {
    return {
      list: (companyId: string) => this.repo.listApiKeys(companyId),
      create: (input: CreateApiKeyInput) => this.repo.createApiKey(input),
      rotate: (companyId: string, keyId: string, createdBy?: string) => this.repo.rotateApiKey(companyId, keyId, createdBy),
      disable: (companyId: string, keyId: string) => this.repo.disableApiKey(companyId, keyId),
    };
  }

  get subscriptions() {
    return {
      list: (companyId: string) => this.repo.listWebhookSubscriptions(companyId),
      create: (companyId: string, name: string, url: string, events: Parameters<IntegrationRepository["createWebhookSubscription"]>[3]) =>
        this.repo.createWebhookSubscription(companyId, name, url, events),
      deliveries: (companyId: string) => this.repo.listWebhookDeliveries(companyId),
      retry: (companyId: string, deliveryId: string) => this.webhooks.retryDelivery(companyId, deliveryId),
    };
  }

  getOverview(companyId: string) {
    return this.repo.getOverview(companyId);
  }

  listConnectors(companyId: string) {
    return this.repo.listConnectors(companyId);
  }

  async authenticateApiKey(rawKey: string, ipAddress?: string): Promise<ApiAuthContext | null> {
    const keyHash = hashSecret(rawKey);
    const validated = await this.repo.validateApiKey(keyHash);
    if (!validated || !validated.isActive) return null;
    if (validated.expiresAt && new Date(validated.expiresAt) < new Date()) return null;
    if (validated.ipAllowlist.length > 0 && ipAddress && !validated.ipAllowlist.includes(ipAddress)) return null;

    void this.repo.recordApiKeyUsage(validated.keyId);

    return {
      companyId: validated.companyId,
      authType: "api_key",
      authId: validated.keyId,
      scopes: validated.scopes,
      ipAddress,
    };
  }

  async authenticateBearer(token: string, ipAddress?: string): Promise<ApiAuthContext | null> {
    const oauth = await this.oauth.validateToken(token);
    if (oauth) {
      return { companyId: oauth.companyId, authType: "oauth", authId: oauth.authId, scopes: oauth.scopes, ipAddress };
    }
    return this.authenticateApiKey(token, ipAddress);
  }

  checkRateLimit(ctx: ApiAuthContext, limit = 1000): boolean {
    return apiRateLimiter.check(`${ctx.companyId}:${ctx.authId}`, limit, 60_000).allowed;
  }

  requireScopes(ctx: ApiAuthContext, required: ApiScope[]): void {
    const { valid, missing } = validateScopes(ctx.scopes, required);
    if (!valid) throw new Error(`Missing scopes: ${missing.join(", ")}`);
  }

  audit(ctx: ApiAuthContext, method: string, path: string, statusCode: number, latencyMs: number, version = "v1") {
    void this.repo.auditApiCall({
      companyId: ctx.companyId,
      authType: ctx.authType,
      authId: ctx.authId,
      method,
      path,
      apiVersion: version,
      statusCode,
      latencyMs,
      ipAddress: ctx.ipAddress,
      scopes: ctx.scopes,
    });
  }
}
