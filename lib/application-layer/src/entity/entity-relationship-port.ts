/** Prepared interface for entity_relationships — no table yet, zero duplication at call sites. */
export type EntityRelationshipReadModel = Readonly<{
  id: string;
  tenantId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  targetEntityType: string;
  targetEntityId: string;
  relationType: string;
  label: string;
  metadata: Readonly<Record<string, unknown>>;
  createdAt: string;
}>;

export type EntityRelationshipReadPort = {
  listForEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<readonly EntityRelationshipReadModel[]>;
};
