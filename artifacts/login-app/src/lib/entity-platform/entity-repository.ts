import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EntityContactCreateInput,
  EntityContactUpdateInput,
  EntityFileCreateInput,
  EntityTagCreateInput,
  EntityCustomFieldValueUpsertInput,
  EntityActivityCreateInput,
  EntityListFilter,
} from "@workspace/application-layer";
import {
  mapContactRow,
  mapFileRow,
  mapTagRow,
  mapTagAssignmentRow,
  mapCustomFieldDefinitionRow,
  mapCustomFieldValueRow,
  mapActivityRow,
} from "./entity-row-mappers.js";

const ENTITY_CONTACT_COLUMNS =
  "id, tenant_id, entity_type, entity_id, contact_type, display_name, emails, phones, whatsapp, preferred_language, preferred_channel, notes, avatar_url, status, is_primary, created_at, updated_at";

const ENTITY_FILE_COLUMNS =
  "id, tenant_id, entity_type, entity_id, file_name, mime_type, size_bytes, category, storage_provider, storage_path, preview_metadata, version, created_at";

const ENTITY_TAG_COLUMNS = "id, tenant_id, name, color, icon, category, description, is_system";

const ENTITY_CUSTOM_FIELD_COLUMNS =
  "id, tenant_id, entity_type, field_key, label, field_type, options, sort_order";

const ENTITY_ACTIVITY_COLUMNS =
  "id, tenant_id, entity_type, entity_id, activity_type, subject, body, outcome, duration_seconds, actor_id, actor_name, related_entity_type, related_entity_id, attachments, occurred_at";

export function createEntityRepository(client: SupabaseClient) {
  return Object.freeze({
    async listContacts(tenantId: string, entityType: string, entityId: string, filter?: EntityListFilter) {
      let query = client
        .from("entity_contacts")
        .select(ENTITY_CONTACT_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .is("deleted_at", null)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false });

      if (filter?.search) {
        query = query.ilike("search_text", `%${filter.search.toLowerCase()}%`);
      }
      if (filter?.limit) query = query.limit(filter.limit);
      if (filter?.offset) query = query.range(filter.offset, filter.offset + (filter.limit ?? 50) - 1);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(mapContactRow);
    },

    async searchContacts(tenantId: string, search: string, limit = 20) {
      const { data, error } = await client
        .from("entity_contacts")
        .select(ENTITY_CONTACT_COLUMNS)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .ilike("search_text", `%${search.toLowerCase()}%`)
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapContactRow);
    },

    async createContact(input: EntityContactCreateInput) {
      const { data, error } = await client
        .from("entity_contacts")
        .insert({
          tenant_id: input.tenantId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          contact_type: input.contactType ?? "primary",
          display_name: input.displayName,
          emails: input.emails ?? [],
          phones: input.phones ?? [],
          whatsapp: input.whatsapp ?? null,
          preferred_language: input.preferredLanguage ?? null,
          preferred_channel: input.preferredChannel ?? null,
          notes: input.notes ?? null,
          avatar_url: input.avatarUrl ?? null,
          is_primary: input.isPrimary ?? false,
          created_by: input.actorUserId,
          updated_by: input.actorUserId,
        })
        .select(ENTITY_CONTACT_COLUMNS)
        .single();

      if (error) throw error;
      return mapContactRow(data);
    },

    async updateContact(tenantId: string, contactId: string, input: EntityContactUpdateInput) {
      const patch: Record<string, unknown> = { updated_by: input.actorUserId };
      if (input.contactType !== undefined) patch.contact_type = input.contactType;
      if (input.displayName !== undefined) patch.display_name = input.displayName;
      if (input.emails !== undefined) patch.emails = input.emails;
      if (input.phones !== undefined) patch.phones = input.phones;
      if (input.whatsapp !== undefined) patch.whatsapp = input.whatsapp;
      if (input.preferredLanguage !== undefined) patch.preferred_language = input.preferredLanguage;
      if (input.preferredChannel !== undefined) patch.preferred_channel = input.preferredChannel;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
      if (input.status !== undefined) patch.status = input.status;
      if (input.isPrimary !== undefined) patch.is_primary = input.isPrimary;

      const { data, error } = await client
        .from("entity_contacts")
        .update(patch)
        .eq("tenant_id", tenantId)
        .eq("id", contactId)
        .is("deleted_at", null)
        .select(ENTITY_CONTACT_COLUMNS)
        .single();

      if (error) throw error;
      return mapContactRow(data);
    },

    async archiveContact(tenantId: string, contactId: string, actorUserId: string) {
      const { error } = await client
        .from("entity_contacts")
        .update({ deleted_at: new Date().toISOString(), updated_by: actorUserId })
        .eq("tenant_id", tenantId)
        .eq("id", contactId);

      if (error) throw error;
    },

    async listFiles(tenantId: string, entityType: string, entityId: string, filter?: EntityListFilter) {
      let query = client
        .from("entity_files")
        .select(ENTITY_FILE_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (filter?.search) query = query.ilike("file_name", `%${filter.search}%`);
      if (filter?.limit) query = query.limit(filter.limit);

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((row) => {
        const previewUrl =
          row.storage_provider === "supabase" && row.storage_path
            ? client.storage.from("entity-files").getPublicUrl(String(row.storage_path)).data.publicUrl
            : null;
        return mapFileRow(row, previewUrl);
      });
    },

    async searchFiles(tenantId: string, search: string, limit = 20) {
      const { data, error } = await client
        .from("entity_files")
        .select(ENTITY_FILE_COLUMNS)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .ilike("file_name", `%${search}%`)
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map((row) => mapFileRow(row, null));
    },

    async createFile(input: EntityFileCreateInput) {
      const { data, error } = await client
        .from("entity_files")
        .insert({
          tenant_id: input.tenantId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          file_name: input.fileName,
          mime_type: input.mimeType,
          size_bytes: input.sizeBytes,
          category: input.category ?? null,
          storage_provider: input.storageProvider ?? "supabase",
          storage_path: input.storagePath,
          preview_metadata: input.previewMetadata ?? {},
          permissions: input.permissions ?? {},
          uploaded_by: input.actorUserId,
          created_by: input.actorUserId,
          updated_by: input.actorUserId,
        })
        .select(ENTITY_FILE_COLUMNS)
        .single();

      if (error) throw error;
      return mapFileRow(data, null);
    },

    async archiveFile(tenantId: string, fileId: string, actorUserId: string) {
      const { error } = await client
        .from("entity_files")
        .update({ deleted_at: new Date().toISOString(), updated_by: actorUserId })
        .eq("tenant_id", tenantId)
        .eq("id", fileId);

      if (error) throw error;
    },

    async listTagDefinitions(tenantId: string, filter?: EntityListFilter) {
      let query = client
        .from("entity_tags")
        .select(ENTITY_TAG_COLUMNS)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("name");

      if (filter?.search) query = query.ilike("search_text", `%${filter.search.toLowerCase()}%`);
      if (filter?.limit) query = query.limit(filter.limit);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(mapTagRow);
    },

    async listTagsForEntity(tenantId: string, entityType: string, entityId: string) {
      const { data, error } = await client
        .from("entity_tag_assignments")
        .select(`id, tag_id, entity_tags (${ENTITY_TAG_COLUMNS})`)
        .eq("tenant_id", tenantId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .is("deleted_at", null);

      if (error) throw error;
      return (data ?? [])
        .map(mapTagAssignmentRow)
        .filter((item): item is NonNullable<typeof item> => item != null);
    },

    async searchTags(tenantId: string, search: string, limit = 20) {
      const { data, error } = await client
        .from("entity_tags")
        .select(ENTITY_TAG_COLUMNS)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .ilike("search_text", `%${search.toLowerCase()}%`)
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapTagRow);
    },

    async createTagDefinition(input: EntityTagCreateInput) {
      const { data, error } = await client
        .from("entity_tags")
        .insert({
          tenant_id: input.tenantId,
          name: input.name,
          color: input.color ?? null,
          icon: input.icon ?? null,
          category: input.category ?? null,
          description: input.description ?? null,
          is_system: input.isSystem ?? false,
          created_by: input.actorUserId,
          updated_by: input.actorUserId,
        })
        .select(ENTITY_TAG_COLUMNS)
        .single();

      if (error) throw error;
      return mapTagRow(data);
    },

    async assignTag(
      tenantId: string,
      entityType: string,
      entityId: string,
      tagId: string,
      actorUserId: string,
    ) {
      const { error } = await client.from("entity_tag_assignments").upsert(
        {
          tenant_id: tenantId,
          entity_type: entityType,
          entity_id: entityId,
          tag_id: tagId,
          created_by: actorUserId,
          updated_by: actorUserId,
          deleted_at: null,
        },
        { onConflict: "tenant_id,entity_type,entity_id,tag_id" },
      );

      if (error) throw error;
    },

    async unassignTag(
      tenantId: string,
      entityType: string,
      entityId: string,
      tagId: string,
      actorUserId: string,
    ) {
      const { error } = await client
        .from("entity_tag_assignments")
        .update({ deleted_at: new Date().toISOString(), updated_by: actorUserId })
        .eq("tenant_id", tenantId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("tag_id", tagId);

      if (error) throw error;
    },

    async listCustomFieldDefinitions(tenantId: string, entityType: string) {
      const { data, error } = await client
        .from("entity_custom_fields")
        .select(ENTITY_CUSTOM_FIELD_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("entity_type", entityType)
        .is("deleted_at", null)
        .order("sort_order");

      if (error) throw error;
      return (data ?? []).map(mapCustomFieldDefinitionRow);
    },

    async listCustomFieldValues(tenantId: string, entityType: string, entityId: string) {
      const { data, error } = await client
        .from("entity_custom_field_values")
        .select(`field_id, value_text, value_json, entity_custom_fields (${ENTITY_CUSTOM_FIELD_COLUMNS})`)
        .eq("tenant_id", tenantId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .is("deleted_at", null);

      if (error) throw error;
      return (data ?? [])
        .map(mapCustomFieldValueRow)
        .filter((item): item is NonNullable<typeof item> => item != null);
    },

    async searchCustomFieldDefinitions(tenantId: string, search: string, limit = 20) {
      const { data, error } = await client
        .from("entity_custom_fields")
        .select(ENTITY_CUSTOM_FIELD_COLUMNS)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .or(`label.ilike.%${search}%,field_key.ilike.%${search}%`)
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapCustomFieldDefinitionRow);
    },

    async upsertCustomFieldValue(input: EntityCustomFieldValueUpsertInput) {
      const { data, error } = await client
        .from("entity_custom_field_values")
        .upsert(
          {
            tenant_id: input.tenantId,
            entity_type: input.entityType,
            entity_id: input.entityId,
            field_id: input.fieldId,
            value_text: input.valueText ?? null,
            value_json: input.valueJson ?? null,
            created_by: input.actorUserId,
            updated_by: input.actorUserId,
            deleted_at: null,
          },
          { onConflict: "tenant_id,entity_type,entity_id,field_id" },
        )
        .select(`field_id, value_text, value_json, entity_custom_fields (${ENTITY_CUSTOM_FIELD_COLUMNS})`)
        .single();

      if (error) throw error;
      const mapped = mapCustomFieldValueRow(data);
      if (!mapped) throw new Error("Custom field value mapping failed");
      return mapped;
    },

    async listActivities(tenantId: string, entityType: string, entityId: string, filter?: EntityListFilter) {
      let query = client
        .from("entity_activities")
        .select(ENTITY_ACTIVITY_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false });

      if (filter?.search) {
        query = query.or(`subject.ilike.%${filter.search}%,body.ilike.%${filter.search}%`);
      }
      if (filter?.limit) query = query.limit(filter.limit);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(mapActivityRow);
    },

    async searchActivities(tenantId: string, search: string, limit = 20) {
      const { data, error } = await client
        .from("entity_activities")
        .select(ENTITY_ACTIVITY_COLUMNS)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .or(`subject.ilike.%${search}%,body.ilike.%${search}%`)
        .order("occurred_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapActivityRow);
    },

    async createActivity(input: EntityActivityCreateInput) {
      const { data, error } = await client
        .from("entity_activities")
        .insert({
          tenant_id: input.tenantId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          activity_type: input.activityType,
          subject: input.subject,
          body: input.body ?? null,
          outcome: input.outcome ?? null,
          duration_seconds: input.durationSeconds ?? null,
          actor_id: input.actorId ?? input.actorUserId,
          actor_name: input.actorName ?? null,
          related_entity_type: input.relatedEntityType ?? null,
          related_entity_id: input.relatedEntityId ?? null,
          attachments: input.attachments ?? [],
          occurred_at: input.occurredAt ?? new Date().toISOString(),
          created_by: input.actorUserId,
          updated_by: input.actorUserId,
        })
        .select(ENTITY_ACTIVITY_COLUMNS)
        .single();

      if (error) throw error;
      return mapActivityRow(data);
    },
  });
}

export type EntityRepository = ReturnType<typeof createEntityRepository>;
