import type {
  CustomerTagReadPort,
  CustomerContactReadPort,
  CustomerCustomFieldReadPort,
  FileReadPort,
  ActivityReadPort,
} from "../ports/repository-ports.js";
import type {
  EntityContactReadPort,
  EntityTagReadPort,
  EntityCustomFieldReadPort,
  EntityFileReadPort,
  EntityActivityReadPort,
} from "./entity-models.js";

const CUSTOMER = "customer";

export function createCustomerTagReadPortFromEntity(
  entityTagRead: EntityTagReadPort,
): CustomerTagReadPort {
  return {
    async listForCustomer(tenantId, customerId) {
      const assignments = await entityTagRead.listForEntity(tenantId, CUSTOMER, customerId);
      return assignments.map((item) =>
        Object.freeze({
          id: item.tag.id,
          label: item.tag.name,
        }),
      );
    },
  };
}

export function createCustomerContactReadPortFromEntity(
  entityContactRead: EntityContactReadPort,
): CustomerContactReadPort {
  return {
    async listForCustomer(tenantId, customerId) {
      const contacts = await entityContactRead.list(tenantId, CUSTOMER, customerId);
      return contacts.map((contact) => {
        const primaryEmail = contact.emails.find((e) => e.isPrimary) ?? contact.emails[0];
        const primaryPhone = contact.phones.find((p) => p.isPrimary) ?? contact.phones[0];
        return Object.freeze({
          id: contact.id,
          name: contact.displayName,
          email: primaryEmail?.value ?? null,
          phone: primaryPhone?.value ?? contact.whatsapp,
          role: contact.contactType,
          isPrimary: contact.isPrimary,
        });
      });
    },
  };
}

export function createCustomerCustomFieldReadPortFromEntity(
  entityCustomFieldRead: EntityCustomFieldReadPort,
): CustomerCustomFieldReadPort {
  return {
    async listForCustomer(tenantId, customerId) {
      const values = await entityCustomFieldRead.listValues(tenantId, CUSTOMER, customerId);
      return values.map((field) =>
        Object.freeze({
          key: field.fieldKey,
          label: field.label,
          value: field.value,
        }),
      );
    },
  };
}

export function createFileReadPortFromEntity(entityFileRead: EntityFileReadPort): FileReadPort {
  return {
    async listForEntity(tenantId, entityType, entityId, limit = 25) {
      const files = await entityFileRead.list(tenantId, entityType, entityId, { limit });
      return files.map((file) =>
        Object.freeze({
          id: file.id,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          uploadedAt: file.uploadedAt,
          previewUrl: file.previewUrl,
        }),
      );
    },
  };
}

export function createActivityReadPortFromEntity(
  entityActivityRead: EntityActivityReadPort,
): ActivityReadPort {
  return {
    async listForCustomer(tenantId, customerId, limit = 25) {
      const activities = await entityActivityRead.list(tenantId, CUSTOMER, customerId, { limit });
      return activities.map((activity) =>
        Object.freeze({
          id: activity.id,
          channel: activity.channel,
          subject: activity.subject,
          occurredAt: activity.occurredAt,
          preview: activity.preview,
          actor: activity.actorName ?? undefined,
        }),
      );
    },
  };
}

export type CustomerEntityFacadePorts = Readonly<{
  customerTagRead: CustomerTagReadPort;
  customerContactRead: CustomerContactReadPort;
  customerCustomFieldRead: CustomerCustomFieldReadPort;
  fileRead: FileReadPort;
  activityRead: ActivityReadPort;
}>;

export function createCustomerEntityFacadePorts(
  entityPorts: Readonly<{
    entityTagRead: EntityTagReadPort;
    entityContactRead: EntityContactReadPort;
    entityCustomFieldRead: EntityCustomFieldReadPort;
    entityFileRead: EntityFileReadPort;
    entityActivityRead: EntityActivityReadPort;
  }>,
): CustomerEntityFacadePorts {
  return Object.freeze({
    customerTagRead: createCustomerTagReadPortFromEntity(entityPorts.entityTagRead),
    customerContactRead: createCustomerContactReadPortFromEntity(entityPorts.entityContactRead),
    customerCustomFieldRead: createCustomerCustomFieldReadPortFromEntity(entityPorts.entityCustomFieldRead),
    fileRead: createFileReadPortFromEntity(entityPorts.entityFileRead),
    activityRead: createActivityReadPortFromEntity(entityPorts.entityActivityRead),
  });
}
