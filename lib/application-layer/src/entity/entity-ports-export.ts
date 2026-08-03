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
} from "../entity/entity-models.js";

export type {
  EntityRef,
  EntityContactReadModel,
  EntityContactCreateInput,
  EntityContactUpdateInput,
  EntityFileReadModel,
  EntityFileCreateInput,
  EntityTagReadModel,
  EntityTagAssignmentReadModel,
  EntityTagCreateInput,
  EntityCustomFieldDefinitionReadModel,
  EntityCustomFieldValueReadModel,
  EntityCustomFieldValueUpsertInput,
  EntityActivityReadModel,
  EntityActivityCreateInput,
  EntityListFilter,
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
} from "../entity/entity-models.js";

export { ENTITY_TYPES, ENTITY_CONTACT_TYPES, ENTITY_ACTIVITY_TYPES, ENTITY_CUSTOM_FIELD_TYPES, isEntityType } from "../entity/entity-types.js";
export type { EntityType, EntityContactType, EntityActivityType, EntityCustomFieldType } from "../entity/entity-types.js";

export type EntityPorts = Readonly<{
  entityContactRead: EntityContactReadPort;
  entityContactWrite: EntityContactWritePort;
  entityFileRead: EntityFileReadPort;
  entityFileWrite: EntityFileWritePort;
  entityTagRead: EntityTagReadPort;
  entityTagWrite: EntityTagWritePort;
  entityCustomFieldRead: EntityCustomFieldReadPort;
  entityCustomFieldWrite: EntityCustomFieldWritePort;
  entityActivityRead: EntityActivityReadPort;
  entityActivityWrite: EntityActivityWritePort;
}>;
