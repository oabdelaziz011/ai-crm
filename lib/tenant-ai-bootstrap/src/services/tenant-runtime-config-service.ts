import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_AI_BOOTSTRAP_RPC } from "../constants.js";
import {
  resolveTenantRuntimeConfig,
  type TenantRuntimeConfig,
} from "../resolve-tenant-runtime-config.js";
import { TenantAiBootstrapService } from "./tenant-ai-bootstrap-service.js";

export class TenantRuntimeConfigService {
  private readonly bootstrap: TenantAiBootstrapService;

  constructor(private readonly client: SupabaseClient) {
    this.bootstrap = new TenantAiBootstrapService(client);
  }

  async resolve(companyId: string): Promise<TenantRuntimeConfig> {
    return resolveTenantRuntimeConfig(this.client, companyId);
  }

  /**
   * Ensures bootstrap outputs exist, then resolves runtime configuration.
   * Reuses idempotent Tenant AI Bootstrap — never creates duplicate assistants.
   */
  async ensureReady(companyId: string): Promise<TenantRuntimeConfig> {
    let config = await this.resolve(companyId);
    if (config.ready) {
      return config;
    }

    const { error } = await this.client.rpc(TENANT_AI_BOOTSTRAP_RPC, {
      p_company_id: companyId,
    });
    if (error) throw error;

    config = await this.resolve(companyId);
    if (config.ready) {
      return config;
    }

    // Platform companies are skipped by the SQL bootstrap RPC — provision via service layer.
    await this.bootstrap.provisionWithServices(companyId, {
      openAiApiKey: process.env.OPENAI_API_KEY ?? null,
      includePlatformCompanies: true,
    });

    return this.resolve(companyId);
  }
}

export function createTenantRuntimeConfigService(client: SupabaseClient): TenantRuntimeConfigService {
  return new TenantRuntimeConfigService(client);
}
