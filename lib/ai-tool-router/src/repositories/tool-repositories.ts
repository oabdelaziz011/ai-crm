import type {
  ListToolExecutionsFilter,
  ToolDefinitionRecord,
  UpdateToolDefinitionInput,
} from "../types.js";
import type {
  CompleteToolExecutionInput,
  CreateToolExecutionInput,
  ToolExecutionRecord,
} from "../types.js";

export interface ToolDefinitionRepository {
  listEnabled(): Promise<ToolDefinitionRecord[]>;
  listAll(): Promise<ToolDefinitionRecord[]>;
  findById(id: string): Promise<ToolDefinitionRecord | null>;
  findByKey(key: string): Promise<ToolDefinitionRecord | null>;
  updateEnabled(input: UpdateToolDefinitionInput): Promise<ToolDefinitionRecord>;
}

export interface ToolExecutionRepository {
  create(input: CreateToolExecutionInput): Promise<ToolExecutionRecord>;
  markRunning(executionId: string): Promise<ToolExecutionRecord>;
  complete(input: CompleteToolExecutionInput): Promise<ToolExecutionRecord>;
  findById(id: string): Promise<ToolExecutionRecord | null>;
  list(filter: ListToolExecutionsFilter): Promise<ToolExecutionRecord[]>;
}
