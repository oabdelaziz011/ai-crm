import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyChannelRepository } from "./company-channel-repository.js";
import type {
  CommunicationChannelRecord,
  CompanyChannelRecord,
  CreateCompanyChannelInput,
  ListCompanyChannelsFilter,
  UpdateCompanyChannelConfigurationInput,
  UpdateCompanyChannelHealthInput,
} from "../types.js";
import { CompanyChannelNotFoundError } from "../errors.js";

const TABLE = "company_channels";
const SELECT_WITH_CHANNEL =
  "*, communication_channel:communication_channels(id, key, display_name, description, icon, supports_media, supports_templates, supports_reactions, supports_typing, supports_read_receipts, supports_delivery_receipts, is_active, created_at, updated_at)";

function mapCommunicationChannel(
  row: Record<string, unknown> | null | undefined,
): CommunicationChannelRecord | null {
  if (!row) return null;
  return {
    id: row.id as string,
    key: row.key as CommunicationChannelRecord["key"],
    display_name: row.display_name as string,
    description: row.description as string,
    icon: (row.icon as string | null) ?? null,
    supports_media: Boolean(row.supports_media),
    supports_templates: Boolean(row.supports_templates),
    supports_reactions: Boolean(row.supports_reactions),
    supports_typing: Boolean(row.supports_typing),
    supports_read_receipts: Boolean(row.supports_read_receipts),
    supports_delivery_receipts: Boolean(row.supports_delivery_receipts),
    is_active: Boolean(row.is_active),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapRow(row: Record<string, unknown>): CompanyChannelRecord {
  const embedded = row.communication_channel ?? row.communication_channels;
  const channelRow = Array.isArray(embedded) ? embedded[0] : embedded;

  return {
    id: row.id as string,
    company_id: row.company_id as string,
    channel_id: row.channel_id as string,
    display_name: row.display_name as string,
    status: row.status as CompanyChannelRecord["status"],
    provider: row.provider as string,
    configuration: (row.configuration as Record<string, unknown>) ?? {},
    webhook_url: (row.webhook_url as string | null) ?? null,
    webhook_secret: (row.webhook_secret as string | null) ?? null,
    external_account_id: (row.external_account_id as string | null) ?? null,
    is_default: Boolean(row.is_default),
    is_enabled: Boolean(row.is_enabled),
    health_status: row.health_status as CompanyChannelRecord["health_status"],
    last_health_check: (row.last_health_check as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
    deleted_by: (row.deleted_by as string | null) ?? null,
    communication_channel: mapCommunicationChannel(channelRow as Record<string, unknown> | undefined),
  };
}

export function createSupabaseCompanyChannelRepository(client: SupabaseClient): CompanyChannelRepository {
  return {
    async create(input: CreateCompanyChannelInput): Promise<CompanyChannelRecord> {
      if (input.isDefault) {
        await client
          .from(TABLE)
          .update({ is_default: false })
          .eq("company_id", input.companyId)
          .is("deleted_at", null);
      }

      const { data, error } = await client
        .from(TABLE)
        .insert({
          company_id: input.companyId,
          channel_id: input.channelId,
          display_name: input.displayName,
          provider: input.provider ?? "",
          configuration: input.configuration ?? {},
          webhook_url: input.webhookUrl ?? null,
          webhook_secret: input.webhookSecret ?? null,
          external_account_id: input.externalAccountId ?? null,
          is_default: input.isDefault ?? false,
          is_enabled: input.isEnabled ?? false,
          status: input.status ?? "pending",
          health_status: input.healthStatus ?? "unknown",
        })
        .select(SELECT_WITH_CHANNEL)
        .single();

      if (error) throw error;
      return mapRow(data as Record<string, unknown>);
    },

    async findById(id: string): Promise<CompanyChannelRecord | null> {
      const { data, error } = await client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return mapRow(data as Record<string, unknown>);
    },

    async findCompanyChannelByPhoneNumberId(phoneNumberId: string): Promise<CompanyChannelRecord[]> {
      const trimmed = phoneNumberId.trim();
      if (!trimmed) return [];

      const { data, error } = await client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .filter("configuration->>phoneNumberId", "eq", trimmed)
        .is("deleted_at", null);

      if (error) throw error;

      const byReference = (data ?? [])
        .map((row) => mapRow(row as Record<string, unknown>))
        .filter((row) => row.communication_channel?.key === "whatsapp");

      if (byReference.length > 0) return byReference;

      const { data: settingsRows, error: settingsError } = await client
        .from("company_whatsapp_settings")
        .select("company_id")
        .eq("phone_number_id", trimmed);

      if (settingsError) throw settingsError;
      if (!settingsRows?.length) return [];

      const companyIds = settingsRows.map((row) => row.company_id as string);
      const { data: channelRows, error: channelError } = await client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .in("company_id", companyIds)
        .is("deleted_at", null);

      if (channelError) throw channelError;

      return (channelRows ?? [])
        .map((row) => mapRow(row as Record<string, unknown>))
        .filter((row) => row.communication_channel?.key === "whatsapp");
    },

    async findCompanyChannelByInstagramBusinessAccountId(
      instagramBusinessAccountId: string,
    ): Promise<CompanyChannelRecord[]> {
      const trimmed = instagramBusinessAccountId.trim();
      if (!trimmed) return [];

      const { data, error } = await client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .filter("configuration->>instagramBusinessAccountId", "eq", trimmed)
        .is("deleted_at", null);

      if (error) throw error;

      const byReference = (data ?? [])
        .map((row) => mapRow(row as Record<string, unknown>))
        .filter((row) => row.communication_channel?.key === "instagram");

      if (byReference.length > 0) return byReference;

      const { data: settingsRows, error: settingsError } = await client
        .from("company_instagram_settings")
        .select("company_id")
        .eq("instagram_business_account_id", trimmed);

      if (settingsError) throw settingsError;
      if (!settingsRows?.length) return [];

      const companyIds = settingsRows.map((row) => row.company_id as string);
      const { data: channelRows, error: channelError } = await client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .in("company_id", companyIds)
        .is("deleted_at", null);

      if (channelError) throw channelError;

      return (channelRows ?? [])
        .map((row) => mapRow(row as Record<string, unknown>))
        .filter((row) => row.communication_channel?.key === "instagram");
    },

    async findCompanyChannelsByInstagramVerifyToken(
      verifyToken: string,
      excludeCompanyChannelId?: string,
    ): Promise<CompanyChannelRecord[]> {
      const trimmed = verifyToken.trim();
      if (!trimmed) return [];

      const { data: hashData, error: hashError } = await client.rpc(
        "whatsapp_verify_token_lookup_hash",
        { p_plaintext: trimmed },
      );
      if (hashError) throw hashError;

      const lookupHash = typeof hashData === "string" ? hashData : "";
      if (lookupHash) {
        const { data: settingsRows, error: settingsError } = await client
          .from("company_instagram_settings")
          .select("company_id")
          .eq("webhook_verify_token_lookup_hash", lookupHash);

        if (settingsError) throw settingsError;

        if (settingsRows?.length) {
          const companyIds = settingsRows.map((row) => row.company_id as string);
          const { data: channelRows, error: channelError } = await client
            .from(TABLE)
            .select(SELECT_WITH_CHANNEL)
            .in("company_id", companyIds)
            .is("deleted_at", null);

          if (channelError) throw channelError;

          return (channelRows ?? [])
            .map((row) => mapRow(row as Record<string, unknown>))
            .filter((row) => row.communication_channel?.key === "instagram")
            .filter((row) => row.id !== excludeCompanyChannelId);
        }
      }

      const { data, error } = await client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .filter("configuration->>verifyToken", "eq", trimmed)
        .is("deleted_at", null);

      if (error) throw error;

      return (data ?? [])
        .map((row) => mapRow(row as Record<string, unknown>))
        .filter((row) => row.communication_channel?.key === "instagram")
        .filter((row) => row.id !== excludeCompanyChannelId);
    },

    async listEnabledInstagramChannels(): Promise<CompanyChannelRecord[]> {
      const { data, error } = await client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .eq("is_enabled", true)
        .is("deleted_at", null);

      if (error) throw error;

      return (data ?? [])
        .map((row) => mapRow(row as Record<string, unknown>))
        .filter((row) => row.communication_channel?.key === "instagram");
    },

    async findCompanyChannelByMessengerPageId(pageId: string): Promise<CompanyChannelRecord[]> {
      const trimmed = pageId.trim();
      if (!trimmed) return [];

      const { data, error } = await client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .filter("configuration->>pageId", "eq", trimmed)
        .eq("is_enabled", true)
        .is("deleted_at", null);

      if (error) throw error;

      const byReference = (data ?? [])
        .map((row) => mapRow(row as Record<string, unknown>))
        .filter((row) => row.communication_channel?.key === "messenger");

      if (byReference.length > 0) return byReference;

      const { data: settingsRows, error: settingsError } = await client
        .from("company_messenger_settings")
        .select("company_id")
        .eq("page_id", trimmed)
        .eq("enabled", true);

      if (settingsError) throw settingsError;
      if (!settingsRows?.length) return [];

      const companyIds = settingsRows.map((row) => row.company_id as string);
      const { data: channelRows, error: channelError } = await client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .in("company_id", companyIds)
        .eq("is_enabled", true)
        .is("deleted_at", null);

      if (channelError) throw channelError;

      return (channelRows ?? [])
        .map((row) => mapRow(row as Record<string, unknown>))
        .filter((row) => row.communication_channel?.key === "messenger");
    },

    async findCompanyChannelsByMessengerVerifyToken(
      verifyToken: string,
      excludeCompanyChannelId?: string,
    ): Promise<CompanyChannelRecord[]> {
      const trimmed = verifyToken.trim();
      if (!trimmed) return [];

      const { data: hashData, error: hashError } = await client.rpc(
        "whatsapp_verify_token_lookup_hash",
        { p_plaintext: trimmed },
      );
      if (hashError) throw hashError;

      const lookupHash = typeof hashData === "string" ? hashData : "";
      if (lookupHash) {
        const { data: settingsRows, error: settingsError } = await client
          .from("company_messenger_settings")
          .select("company_id")
          .eq("webhook_verify_token_lookup_hash", lookupHash);

        if (settingsError) throw settingsError;

        if (settingsRows?.length) {
          const companyIds = settingsRows.map((row) => row.company_id as string);
          const { data: channelRows, error: channelError } = await client
            .from(TABLE)
            .select(SELECT_WITH_CHANNEL)
            .in("company_id", companyIds)
            .is("deleted_at", null);

          if (channelError) throw channelError;

          return (channelRows ?? [])
            .map((row) => mapRow(row as Record<string, unknown>))
            .filter((row) => row.communication_channel?.key === "messenger")
            .filter((row) => row.id !== excludeCompanyChannelId);
        }
      }

      const { data, error } = await client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .filter("configuration->>verifyToken", "eq", trimmed)
        .is("deleted_at", null);

      if (error) throw error;

      return (data ?? [])
        .map((row) => mapRow(row as Record<string, unknown>))
        .filter((row) => row.communication_channel?.key === "messenger")
        .filter((row) => row.id !== excludeCompanyChannelId);
    },

    async listEnabledMessengerChannels(): Promise<CompanyChannelRecord[]> {
      const { data, error } = await client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .eq("is_enabled", true)
        .is("deleted_at", null);

      if (error) throw error;

      return (data ?? [])
        .map((row) => mapRow(row as Record<string, unknown>))
        .filter((row) => row.communication_channel?.key === "messenger");
    },

    async findCompanyChannelsByWhatsAppVerifyToken(
      verifyToken: string,
      excludeCompanyChannelId?: string,
    ): Promise<CompanyChannelRecord[]> {
      const trimmed = verifyToken.trim();
      if (!trimmed) return [];

      const { data: hashData, error: hashError } = await client.rpc(
        "whatsapp_verify_token_lookup_hash",
        { p_plaintext: trimmed },
      );
      if (hashError) throw hashError;

      const lookupHash = typeof hashData === "string" ? hashData : "";
      if (lookupHash) {
        const { data: settingsRows, error: settingsError } = await client
          .from("company_whatsapp_settings")
          .select("company_id")
          .eq("webhook_verify_token_lookup_hash", lookupHash);

        if (settingsError) throw settingsError;

        if (settingsRows?.length) {
          const companyIds = settingsRows.map((row) => row.company_id as string);
          const { data: channelRows, error: channelError } = await client
            .from(TABLE)
            .select(SELECT_WITH_CHANNEL)
            .in("company_id", companyIds)
            .is("deleted_at", null);

          if (channelError) throw channelError;

          return (channelRows ?? [])
            .map((row) => mapRow(row as Record<string, unknown>))
            .filter((row) => row.communication_channel?.key === "whatsapp")
            .filter((row) => row.id !== excludeCompanyChannelId);
        }
      }

      const { data, error } = await client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .filter("configuration->>verifyToken", "eq", trimmed)
        .is("deleted_at", null);

      if (error) throw error;

      return (data ?? [])
        .map((row) => mapRow(row as Record<string, unknown>))
        .filter((row) => row.communication_channel?.key === "whatsapp")
        .filter((row) => row.id !== excludeCompanyChannelId);
    },

    async listEnabledWhatsAppChannels(): Promise<CompanyChannelRecord[]> {
      const { data, error } = await client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .eq("is_enabled", true)
        .is("deleted_at", null);

      if (error) throw error;

      return (data ?? [])
        .map((row) => mapRow(row as Record<string, unknown>))
        .filter((row) => row.communication_channel?.key === "whatsapp");
    },

    async findDefault(companyId: string): Promise<CompanyChannelRecord | null> {
      const { data, error } = await client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .eq("company_id", companyId)
        .eq("is_default", true)
        .eq("is_enabled", true)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return mapRow(data as Record<string, unknown>);
    },

    async list(filter: ListCompanyChannelsFilter): Promise<CompanyChannelRecord[]> {
      let query = client
        .from(TABLE)
        .select(SELECT_WITH_CHANNEL)
        .eq("company_id", filter.companyId)
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("display_name", { ascending: true });

      if (filter.isEnabled != null) query = query.eq("is_enabled", filter.isEnabled);
      if (filter.healthStatus) query = query.eq("health_status", filter.healthStatus);

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
      if (filter.channelKey) {
        rows = rows.filter((row) => row.communication_channel?.key === filter.channelKey);
      }
      return rows;
    },

    async updateConfiguration(
      input: UpdateCompanyChannelConfigurationInput,
    ): Promise<CompanyChannelRecord> {
      const patch: Record<string, unknown> = {
        configuration: input.configuration,
      };
      if (input.provider !== undefined) patch.provider = input.provider;
      if (input.webhookUrl !== undefined) patch.webhook_url = input.webhookUrl;
      if (input.webhookSecret !== undefined) patch.webhook_secret = input.webhookSecret;
      if (input.externalAccountId !== undefined) patch.external_account_id = input.externalAccountId;
      if (input.displayName !== undefined) patch.display_name = input.displayName;

      console.log("[channel-save-debug] repository.updateConfiguration() before Supabase update", {
        companyChannelId: input.companyChannelId,
        patchKeys: Object.keys(patch),
      });
      const { data, error } = await client
        .from(TABLE)
        .update(patch)
        .eq("id", input.companyChannelId)
        .is("deleted_at", null)
        .select(SELECT_WITH_CHANNEL)
        .single();
      console.log("[channel-save-debug] repository.updateConfiguration() after Supabase update", {
        companyChannelId: input.companyChannelId,
        hasData: Boolean(data),
        errorMessage: error?.message ?? null,
      });

      if (error) throw error;
      if (!data) throw new CompanyChannelNotFoundError(input.companyChannelId);
      return mapRow(data as Record<string, unknown>);
    },

    async enable(id: string): Promise<CompanyChannelRecord> {
      const { data, error } = await client
        .from(TABLE)
        .update({
          is_enabled: true,
          status: "active",
        })
        .eq("id", id)
        .is("deleted_at", null)
        .select(SELECT_WITH_CHANNEL)
        .single();

      if (error) throw error;
      if (!data) throw new CompanyChannelNotFoundError(id);
      return mapRow(data as Record<string, unknown>);
    },

    async disable(id: string): Promise<CompanyChannelRecord> {
      const { data, error } = await client
        .from(TABLE)
        .update({
          is_enabled: false,
          status: "disabled",
          is_default: false,
        })
        .eq("id", id)
        .is("deleted_at", null)
        .select(SELECT_WITH_CHANNEL)
        .single();

      if (error) throw error;
      if (!data) throw new CompanyChannelNotFoundError(id);
      return mapRow(data as Record<string, unknown>);
    },

    async setDefault(companyId: string, companyChannelId: string): Promise<CompanyChannelRecord> {
      const { error: clearError } = await client
        .from(TABLE)
        .update({ is_default: false })
        .eq("company_id", companyId)
        .is("deleted_at", null);

      if (clearError) throw clearError;

      const { data, error } = await client
        .from(TABLE)
        .update({ is_default: true })
        .eq("id", companyChannelId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select(SELECT_WITH_CHANNEL)
        .single();

      if (error) throw error;
      if (!data) throw new CompanyChannelNotFoundError(companyChannelId);
      return mapRow(data as Record<string, unknown>);
    },

    async updateHealth(input: UpdateCompanyChannelHealthInput): Promise<CompanyChannelRecord> {
      const { data, error } = await client
        .from(TABLE)
        .update({
          health_status: input.healthStatus,
          last_health_check: input.lastHealthCheck ?? new Date().toISOString(),
        })
        .eq("id", input.companyChannelId)
        .is("deleted_at", null)
        .select(SELECT_WITH_CHANNEL)
        .single();

      if (error) throw error;
      if (!data) throw new CompanyChannelNotFoundError(input.companyChannelId);
      return mapRow(data as Record<string, unknown>);
    },
  };
}
