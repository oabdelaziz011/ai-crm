import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelRegistryRepository } from "./channel-registry-repository.js";
import type { CommunicationChannelRecord } from "../types.js";

const TABLE = "communication_channels";

function mapRow(row: Record<string, unknown>): CommunicationChannelRecord {
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

export function createSupabaseChannelRegistryRepository(
  client: SupabaseClient,
): ChannelRegistryRepository {
  return {
    async listActive(): Promise<CommunicationChannelRecord[]> {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("is_active", true)
        .order("display_name", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
    },

    async findById(id: string): Promise<CommunicationChannelRecord | null> {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return mapRow(data as Record<string, unknown>);
    },

    async findByKey(key: string): Promise<CommunicationChannelRecord | null> {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("key", key)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return mapRow(data as Record<string, unknown>);
    },
  };
}
