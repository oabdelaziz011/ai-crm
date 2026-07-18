import type {
  AIProviderConnectionRecord,
  AIProviderDefinitionRecord,
  CreateAIProviderConnectionInput,
  ListAIProviderConnectionsFilter,
  UpdateAIProviderConnectionHealthInput,
  UpdateAIProviderConnectionInput,
} from "../types.js";

export interface AIProviderDefinitionRepository {
  listActive(): Promise<AIProviderDefinitionRecord[]>;
  listAll(): Promise<AIProviderDefinitionRecord[]>;
  findById(id: string): Promise<AIProviderDefinitionRecord | null>;
  findByKey(key: string): Promise<AIProviderDefinitionRecord | null>;
}

export interface AIProviderConnectionRepository {
  create(input: CreateAIProviderConnectionInput): Promise<AIProviderConnectionRecord>;
  findById(id: string): Promise<AIProviderConnectionRecord | null>;
  list(filter: ListAIProviderConnectionsFilter): Promise<AIProviderConnectionRecord[]>;
  update(input: UpdateAIProviderConnectionInput): Promise<AIProviderConnectionRecord>;
  updateHealth(input: UpdateAIProviderConnectionHealthInput): Promise<AIProviderConnectionRecord>;
  softDelete(connectionId: string, deletedBy?: string | null): Promise<AIProviderConnectionRecord>;
}
