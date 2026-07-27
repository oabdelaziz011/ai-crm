import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiScope } from "@/lib/integration/types";
import { IntegrationRepository } from "@/lib/integration/repositories/integration-repository";
import { hashSecret, generateApiKeySecret } from "@/lib/integration/webhooks/webhook-signature";

/** OAuth 2.1 client credentials and token management. */
export class OAuthService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly repo: IntegrationRepository,
  ) {}

  async clientCredentials(input: { clientId: string; clientSecret: string; scopes?: ApiScope[] }) {
    const { data: client, error } = await this.client
      .from("integration_oauth_clients")
      .select("*")
      .eq("client_id", input.clientId)
      .eq("is_active", true)
      .maybeSingle();
    if (error || !client) throw new Error("Invalid client credentials");

    if (client.client_secret_hash !== hashSecret(input.clientSecret)) {
      throw new Error("Invalid client credentials");
    }

    const token = generateApiKeySecret();
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();
    const scopes = input.scopes?.length ? input.scopes : ((client.scopes as ApiScope[]) ?? []);

    await this.client.from("integration_oauth_tokens").insert({
      company_id: client.company_id,
      client_id: client.id,
      token_hash: hashSecret(token),
      scopes,
      expires_at: expiresAt,
    });

    return {
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: 3600,
      scope: scopes.join(" "),
      companyId: String(client.company_id),
      clientDbId: String(client.id),
    };
  }

  async validateToken(token: string) {
    const tokenHash = hashSecret(token);
    const { data, error } = await this.client
      .from("integration_oauth_tokens")
      .select("*, integration_oauth_clients(id)")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;

    return {
      companyId: String(data.company_id),
      authId: String(data.client_id),
      scopes: (data.scopes as ApiScope[]) ?? [],
    };
  }

  async revokeToken(token: string): Promise<void> {
    await this.client
      .from("integration_oauth_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", hashSecret(token));
  }

  listClients(companyId: string) {
    return this.repo.listOAuthClients(companyId);
  }

  createClient(companyId: string, name: string, redirectUris: string[], scopes: ApiScope[]) {
    return this.repo.createOAuthClient(companyId, name, redirectUris, scopes);
  }
}
