import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EntityContactReadPort,
  EntityContactWritePort,
  EntityFileReadPort,
  EntityFileWritePort,
  EntityTagReadPort,
  EntityTagWritePort,
  EntityCustomFieldReadPort,
  EntityCustomFieldWritePort,
  EntityActivityReadPort,
  EntityActivityWritePort,
} from "@workspace/application-layer";
import type { LoginAppPortContext } from "@/lib/application-layer/adapters/customer-read-port-adapter";
import { createEntityRepository } from "../entity-repository.js";

type EntityResource = "contacts" | "tags" | "files" | "activities" | "custom_fields";

function canReadEntity(ctx: LoginAppPortContext, resource: EntityResource, entityType?: string): boolean {
  if (ctx.isSuperAdmin) return true;
  if (ctx.hasPermission(`entity.${resource}.read`)) return true;
  if (entityType === "customer" && ctx.hasPermission("customers.view")) return true;
  if (entityType === "lead" && ctx.hasPermission("leads.view")) return true;
  if (entityType === "company" && ctx.hasPermission("companies.view")) return true;
  return false;
}

function canWriteEntity(ctx: LoginAppPortContext, resource: EntityResource, entityType?: string): boolean {
  if (ctx.isSuperAdmin) return true;
  if (ctx.hasPermission(`entity.${resource}.write`)) return true;
  if (entityType === "customer" && ctx.hasPermission("customers.edit")) return true;
  if (entityType === "lead" && ctx.hasPermission("leads.edit")) return true;
  if (entityType === "company" && ctx.hasPermission("companies.edit")) return true;
  return false;
}

function assertTenant(tenantId: string, ctx: LoginAppPortContext): boolean {
  return tenantId === ctx.companyId;
}

export function createLoginAppEntityContactReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): EntityContactReadPort {
  const repo = createEntityRepository(client);

  return {
    async list(tenantId, entityType, entityId, filter) {
      if (!assertTenant(tenantId, ctx) || !canReadEntity(ctx, "contacts", entityType)) return [];
      try {
        return await repo.listContacts(tenantId, entityType, entityId, filter);
      } catch {
        return [];
      }
    },
    async search(tenantId, query, limit) {
      if (!assertTenant(tenantId, ctx) || !canReadEntity(ctx, "contacts")) return [];
      try {
        return await repo.searchContacts(tenantId, query, limit);
      } catch {
        return [];
      }
    },
  };
}

export function createLoginAppEntityContactWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): EntityContactWritePort {
  const repo = createEntityRepository(client);

  return {
    async create(input) {
      if (!assertTenant(input.tenantId, ctx) || !canWriteEntity(ctx, "contacts", input.entityType)) {
        throw new Error("Permission denied");
      }
      return repo.createContact(input);
    },
    async update(tenantId, contactId, input) {
      if (!assertTenant(tenantId, ctx) || !canWriteEntity(ctx, "contacts")) {
        throw new Error("Permission denied");
      }
      return repo.updateContact(tenantId, contactId, input);
    },
    async archive(tenantId, contactId, actorUserId) {
      if (!assertTenant(tenantId, ctx) || !canWriteEntity(ctx, "contacts")) {
        throw new Error("Permission denied");
      }
      await repo.archiveContact(tenantId, contactId, actorUserId);
    },
  };
}

export function createLoginAppEntityFileReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): EntityFileReadPort {
  const repo = createEntityRepository(client);

  return {
    async list(tenantId, entityType, entityId, filter) {
      if (!assertTenant(tenantId, ctx) || !canReadEntity(ctx, "files", entityType)) return [];
      try {
        return await repo.listFiles(tenantId, entityType, entityId, filter);
      } catch {
        return [];
      }
    },
    async search(tenantId, query, limit) {
      if (!assertTenant(tenantId, ctx) || !canReadEntity(ctx, "files")) return [];
      try {
        return await repo.searchFiles(tenantId, query, limit);
      } catch {
        return [];
      }
    },
  };
}

export function createLoginAppEntityFileWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): EntityFileWritePort {
  const repo = createEntityRepository(client);

  return {
    async create(input) {
      if (!assertTenant(input.tenantId, ctx) || !canWriteEntity(ctx, "files", input.entityType)) {
        throw new Error("Permission denied");
      }
      return repo.createFile(input);
    },
    async archive(tenantId, fileId, actorUserId) {
      if (!assertTenant(tenantId, ctx) || !canWriteEntity(ctx, "files")) {
        throw new Error("Permission denied");
      }
      await repo.archiveFile(tenantId, fileId, actorUserId);
    },
  };
}

export function createLoginAppEntityTagReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): EntityTagReadPort {
  const repo = createEntityRepository(client);

  return {
    async listDefinitions(tenantId, filter) {
      if (!assertTenant(tenantId, ctx) || !canReadEntity(ctx, "tags")) return [];
      try {
        return await repo.listTagDefinitions(tenantId, filter);
      } catch {
        return [];
      }
    },
    async listForEntity(tenantId, entityType, entityId) {
      if (!assertTenant(tenantId, ctx) || !canReadEntity(ctx, "tags", entityType)) return [];
      try {
        return await repo.listTagsForEntity(tenantId, entityType, entityId);
      } catch {
        return [];
      }
    },
    async search(tenantId, query, limit) {
      if (!assertTenant(tenantId, ctx) || !canReadEntity(ctx, "tags")) return [];
      try {
        return await repo.searchTags(tenantId, query, limit);
      } catch {
        return [];
      }
    },
  };
}

export function createLoginAppEntityTagWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): EntityTagWritePort {
  const repo = createEntityRepository(client);

  return {
    async createDefinition(input) {
      if (!assertTenant(input.tenantId, ctx) || !canWriteEntity(ctx, "tags")) {
        throw new Error("Permission denied");
      }
      return repo.createTagDefinition(input);
    },
    async assign(tenantId, entityType, entityId, tagId, actorUserId) {
      if (!assertTenant(tenantId, ctx) || !canWriteEntity(ctx, "tags", entityType)) {
        throw new Error("Permission denied");
      }
      await repo.assignTag(tenantId, entityType, entityId, tagId, actorUserId);
    },
    async unassign(tenantId, entityType, entityId, tagId, actorUserId) {
      if (!assertTenant(tenantId, ctx) || !canWriteEntity(ctx, "tags", entityType)) {
        throw new Error("Permission denied");
      }
      await repo.unassignTag(tenantId, entityType, entityId, tagId, actorUserId);
    },
  };
}

export function createLoginAppEntityCustomFieldReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): EntityCustomFieldReadPort {
  const repo = createEntityRepository(client);

  return {
    async listDefinitions(tenantId, entityType) {
      if (!assertTenant(tenantId, ctx) || !canReadEntity(ctx, "custom_fields", entityType)) return [];
      try {
        return await repo.listCustomFieldDefinitions(tenantId, entityType);
      } catch {
        return [];
      }
    },
    async listValues(tenantId, entityType, entityId) {
      if (!assertTenant(tenantId, ctx) || !canReadEntity(ctx, "custom_fields", entityType)) return [];
      try {
        return await repo.listCustomFieldValues(tenantId, entityType, entityId);
      } catch {
        return [];
      }
    },
    async search(tenantId, query, limit) {
      if (!assertTenant(tenantId, ctx) || !canReadEntity(ctx, "custom_fields")) return [];
      try {
        return await repo.searchCustomFieldDefinitions(tenantId, query, limit);
      } catch {
        return [];
      }
    },
  };
}

export function createLoginAppEntityCustomFieldWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): EntityCustomFieldWritePort {
  const repo = createEntityRepository(client);

  return {
    async upsertValue(input) {
      if (!assertTenant(input.tenantId, ctx) || !canWriteEntity(ctx, "custom_fields", input.entityType)) {
        throw new Error("Permission denied");
      }
      return repo.upsertCustomFieldValue(input);
    },
  };
}

export function createLoginAppEntityActivityReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): EntityActivityReadPort {
  const repo = createEntityRepository(client);

  return {
    async list(tenantId, entityType, entityId, filter) {
      if (!assertTenant(tenantId, ctx) || !canReadEntity(ctx, "activities", entityType)) return [];
      try {
        return await repo.listActivities(tenantId, entityType, entityId, filter);
      } catch {
        return [];
      }
    },
    async search(tenantId, query, limit) {
      if (!assertTenant(tenantId, ctx) || !canReadEntity(ctx, "activities")) return [];
      try {
        return await repo.searchActivities(tenantId, query, limit);
      } catch {
        return [];
      }
    },
  };
}

export function createLoginAppEntityActivityWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): EntityActivityWritePort {
  const repo = createEntityRepository(client);

  return {
    async create(input) {
      if (!assertTenant(input.tenantId, ctx) || !canWriteEntity(ctx, "activities", input.entityType)) {
        throw new Error("Permission denied");
      }
      return repo.createActivity(input);
    },
  };
}
