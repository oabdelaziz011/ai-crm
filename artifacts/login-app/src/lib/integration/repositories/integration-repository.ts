import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApiAuditEntry,
  ApiScope,
  CreateApiKeyInput,
  CreateApiKeyResult,
  IntegrationApiKey,
  IntegrationConnector,
  IntegrationOverview,
  OAuthClient,
  WebhookDelivery,
  WebhookSubscription,
} from "@/lib/integration/types";
import { hashSecret, generateApiKeySecret, generateWebhookSecret, generateClientSecret } from "@/lib/integration/webhooks/webhook-signature";

function mapApiKey(row: Record<string, unknown>): IntegrationApiKey {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name),
    keyPrefix: String(row.key_prefix),
    scopes: (row.scopes as ApiScope[]) ?? [],
    ipAllowlist: (row.ip_allowlist as string[]) ?? [],
    isActive: Boolean(row.is_active),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
    usageCount: Number(row.usage_count ?? 0),
    createdAt: String(row.created_at),
  };
}

/** Integration hub data access layer. */
export class IntegrationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listApiKeys(companyId: string): Promise<IntegrationApiKey[]> {
    const { data, error } = await this.client
      .from("integration_api_keys")
      .select("id, company_id, name, key_prefix, scopes, ip_allowlist, is_active, expires_at, last_used_at, usage_count, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapApiKey);
  }

  async createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    const { data: entitled, error: entitlementError } = await this.client.rpc("is_feature_enabled", {
      p_company_id: input.companyId,
      p_feature_code: "api_access",
    });
    if (entitlementError) throw new Error(entitlementError.message);
    if (!entitled) {
      const err = new Error("API access is not entitled for this company") as Error & {
        code?: string;
      };
      err.code = "FEATURE_NOT_ENTITLED";
      throw err;
    }

    const secret = generateApiKeySecret();
    const keyHash = hashSecret(secret);
    const keyPrefix = secret.slice(0, 12);

    const { data, error } = await this.client
      .from("integration_api_keys")
      .insert({
        company_id: input.companyId,
        name: input.name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        scopes: input.scopes,
        ip_allowlist: input.ipAllowlist ?? [],
        expires_at: input.expiresAt ?? null,
        created_by: input.createdBy ?? null,
      })
      .select("id, company_id, name, key_prefix, scopes, ip_allowlist, is_active, expires_at, last_used_at, usage_count, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { key: mapApiKey(data), secret };
  }

  async rotateApiKey(companyId: string, keyId: string, createdBy?: string): Promise<CreateApiKeyResult> {
    const { data: existing } = await this.client
      .from("integration_api_keys")
      .select("*")
      .eq("id", keyId)
      .eq("company_id", companyId)
      .single();
    if (!existing) throw new Error("API key not found");

    await this.client.from("integration_api_keys").update({ is_active: false }).eq("id", keyId);

    return this.createApiKey({
      companyId,
      name: `${existing.name} (rotated)`,
      scopes: existing.scopes as ApiScope[],
      ipAllowlist: existing.ip_allowlist as string[],
      createdBy,
    });
  }

  async disableApiKey(companyId: string, keyId: string): Promise<void> {
    const { error } = await this.client
      .from("integration_api_keys")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", keyId)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
  }

  async validateApiKey(keyHash: string) {
    const { data, error } = await this.client.rpc("integration_validate_api_key", { p_key_hash: keyHash });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      keyId: String(row.key_id),
      companyId: String(row.company_id),
      scopes: (row.scopes as ApiScope[]) ?? [],
      ipAllowlist: (row.ip_allowlist as string[]) ?? [],
      isActive: Boolean(row.is_active),
      expiresAt: row.expires_at ? String(row.expires_at) : null,
    };
  }

  async recordApiKeyUsage(keyId: string): Promise<void> {
    await this.client.rpc("integration_record_api_key_usage", { p_key_id: keyId });
  }

  async listOAuthClients(companyId: string): Promise<OAuthClient[]> {
    const { data, error } = await this.client
      .from("integration_oauth_clients")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      companyId: String(row.company_id),
      name: String(row.name),
      clientId: String(row.client_id),
      redirectUris: (row.redirect_uris as string[]) ?? [],
      grantTypes: (row.grant_types as OAuthClient["grantTypes"]) ?? [],
      scopes: (row.scopes as ApiScope[]) ?? [],
      isConfidential: Boolean(row.is_confidential),
      isActive: Boolean(row.is_active),
      createdAt: String(row.created_at),
    }));
  }

  async createOAuthClient(companyId: string, name: string, redirectUris: string[], scopes: ApiScope[]) {
    const clientId = `vor_client_${crypto.randomUUID().replace(/-/g, "")}`;
    const secret = generateClientSecret();
    const { data, error } = await this.client
      .from("integration_oauth_clients")
      .insert({
        company_id: companyId,
        name,
        client_id: clientId,
        client_secret_hash: hashSecret(secret),
        redirect_uris: redirectUris,
        scopes,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return {
      client: {
        id: String(data.id),
        companyId: String(data.company_id),
        name: String(data.name),
        clientId: String(data.client_id),
        redirectUris: (data.redirect_uris as string[]) ?? [],
        grantTypes: (data.grant_types as OAuthClient["grantTypes"]) ?? [],
        scopes: (data.scopes as ApiScope[]) ?? [],
        isConfidential: Boolean(data.is_confidential),
        isActive: Boolean(data.is_active),
        createdAt: String(data.created_at),
      } satisfies OAuthClient,
      clientSecret: secret,
    };
  }

  async listWebhookSubscriptions(companyId: string): Promise<WebhookSubscription[]> {
    const { data, error } = await this.client
      .from("integration_webhook_subscriptions")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      companyId: String(row.company_id),
      name: String(row.name),
      endpointUrl: String(row.endpoint_url),
      eventTypes: (row.event_types as WebhookSubscription["eventTypes"]) ?? [],
      isActive: Boolean(row.is_active),
      isPaused: Boolean(row.is_paused),
      failureCount: Number(row.failure_count ?? 0),
      lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
      lastFailureAt: row.last_failure_at ? String(row.last_failure_at) : null,
      createdAt: String(row.created_at),
    }));
  }

  async createWebhookSubscription(
    companyId: string,
    name: string,
    endpointUrl: string,
    eventTypes: WebhookSubscription["eventTypes"],
  ) {
    const secret = generateWebhookSecret();
    const { data, error } = await this.client
      .from("integration_webhook_subscriptions")
      .insert({
        company_id: companyId,
        name,
        endpoint_url: endpointUrl,
        secret_hash: hashSecret(secret),
        event_types: eventTypes,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return {
      subscription: {
        id: String(data.id),
        companyId: String(data.company_id),
        name: String(data.name),
        endpointUrl: String(data.endpoint_url),
        eventTypes: (data.event_types as WebhookSubscription["eventTypes"]) ?? [],
        isActive: Boolean(data.is_active),
        isPaused: Boolean(data.is_paused),
        failureCount: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        createdAt: String(data.created_at),
      } satisfies WebhookSubscription,
      secret,
    };
  }

  async listWebhookDeliveries(companyId: string, limit = 50): Promise<WebhookDelivery[]> {
    const { data, error } = await this.client
      .from("integration_webhook_deliveries")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      companyId: String(row.company_id),
      subscriptionId: String(row.subscription_id),
      eventType: row.event_type as WebhookDelivery["eventType"],
      eventId: String(row.event_id),
      status: row.status as WebhookDelivery["status"],
      attemptCount: Number(row.attempt_count ?? 0),
      responseStatus: row.response_status ? Number(row.response_status) : null,
      deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
      createdAt: String(row.created_at),
    }));
  }

  async listConnectors(companyId: string): Promise<IntegrationConnector[]> {
    const { data, error } = await this.client
      .from("integration_connectors")
      .select("*")
      .eq("company_id", companyId)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      companyId: String(row.company_id),
      connectorType: row.connector_type as IntegrationConnector["connectorType"],
      name: String(row.name),
      config: (row.config as Record<string, unknown>) ?? {},
      isActive: Boolean(row.is_active),
      healthStatus: row.health_status as IntegrationConnector["healthStatus"],
      lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
    }));
  }

  async getOverview(companyId: string): Promise<IntegrationOverview> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [keys, clients, subs, connectors, pending, failed, audit] = await Promise.all([
      this.client.from("integration_api_keys").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("is_active", true),
      this.client.from("integration_oauth_clients").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("is_active", true),
      this.client.from("integration_webhook_subscriptions").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("is_active", true),
      this.client.from("integration_connectors").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("is_active", true),
      this.client.from("integration_webhook_deliveries").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
      this.client.from("integration_webhook_deliveries").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "failed").gte("created_at", since),
      this.client.from("integration_api_audit_log").select("latency_ms").eq("company_id", companyId).gte("created_at", since),
    ]);

    const latencies = (audit.data ?? []).map((r) => Number(r.latency_ms ?? 0)).filter((n) => n > 0);
    const avgLatency = latencies.length ? Math.round(latencies.reduce((s, n) => s + n, 0) / latencies.length) : 0;

    return {
      apiKeyCount: keys.count ?? 0,
      oauthClientCount: clients.count ?? 0,
      webhookSubscriptionCount: subs.count ?? 0,
      connectorCount: connectors.count ?? 0,
      pendingDeliveries: pending.count ?? 0,
      failedDeliveries24h: failed.count ?? 0,
      apiCalls24h: latencies.length,
      avgLatencyMs: avgLatency,
    };
  }

  async auditApiCall(entry: Omit<ApiAuditEntry, "id" | "createdAt"> & { authId?: string; ipAddress?: string; scopes?: ApiScope[]; errorCode?: string }): Promise<void> {
    await this.client.from("integration_api_audit_log").insert({
      company_id: entry.companyId,
      auth_type: entry.authType,
      auth_id: entry.authId ?? null,
      method: entry.method,
      path: entry.path,
      api_version: entry.apiVersion,
      status_code: entry.statusCode,
      latency_ms: entry.latencyMs,
      ip_address: entry.ipAddress ?? null,
      scopes: entry.scopes ?? [],
      error_code: entry.errorCode ?? null,
    });
  }
}
