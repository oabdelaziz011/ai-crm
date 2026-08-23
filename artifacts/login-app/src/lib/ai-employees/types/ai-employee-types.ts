import type { AiEmployeeRuntimeConfiguration } from "@/lib/ai-employees/adapters";

export type AiEmployeeStatus = "draft" | "published" | "disabled" | "archived";

export type AiEmployeeDbRow = {
  id: string;
  company_id: string;
  name: string;
  display_name: string;
  description: string;
  avatar: string | null;
  department: string | null;
  owner_id: string | null;
  status: AiEmployeeStatus;
  provider: string | null;
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  system_prompt: string;
  system_prompt_summary: string;
  welcome_message: string;
  knowledge_source_ids: string[];
  knowledge_summary: string;
  allowed_tool_keys: string[];
  tool_summary: string;
  allowed_skill_ids: string[];
  skills_summary: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  prompt_version_label: string;
  runtime_configuration: Record<string, unknown>;
  published_version_id: string | null;
  current_version_number: number;
  has_unpublished_draft: boolean;
};

export type AiEmployeeRecord = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  avatar: string | null;
  department: string | null;
  owner: string | null;
  ownerId: string | null;
  status: AiEmployeeStatus;
  provider: string | null;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  systemPrompt: string;
  systemPromptSummary: string;
  welcomeMessage: string;
  knowledgeSourceIds: string[];
  knowledgeSummary: string;
  allowedToolKeys: string[];
  toolSummary: string;
  allowedSkillIds: string[];
  skillsSummary: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  promptVersionLabel: string;
  runtimeConfiguration: AiEmployeeRuntimeConfiguration;
  publishedVersionId: string | null;
  currentVersionNumber: number;
  hasUnpublishedDraft: boolean;
};

export type AiEmployeeListFilter = {
  status?: AiEmployeeStatus | "all";
  department?: string | "all";
  provider?: string | "all";
  ownerId?: string | "all";
  tags?: string[];
  search?: string;
};

export type AiEmployeeFormValues = {
  name: string;
  displayName: string;
  description: string;
  avatar: string | null;
  department: string | null;
  ownerId: string | null;
  status: AiEmployeeStatus;
  provider: string | null;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  systemPrompt: string;
  welcomeMessage: string;
  knowledgeSourceIds: string[];
  allowedToolKeys: string[];
  allowedSkillIds?: string[];
  tags: string[];
};

export type AiEmployeeInsert = Omit<AiEmployeeDbRow, "id" | "created_at" | "updated_at" | "deleted_at"> & {
  id?: string;
};

export type AiEmployeeUpdate = Partial<
  Omit<AiEmployeeDbRow, "id" | "company_id" | "created_at" | "created_by">
>;

export type AiEmployeeListPage = {
  items: AiEmployeeRecord[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type AiEmployeeOwnerOption = {
  id: string;
  label: string;
};

export type ToolDefinitionOption = {
  key: string;
  displayName: string;
  category: string;
};

export type KnowledgeSourceOption = {
  id: string;
  name: string;
  sourceType?: string | null;
  documentCount?: number;
};

export type AiEmployeeConfigurationUpdate = {
  provider?: string | null;
  model?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  systemPrompt?: string;
  welcomeMessage?: string;
  knowledgeSourceIds?: string[];
  allowedToolKeys?: string[];
  allowedSkillIds?: string[];
  promptVersionLabel?: string;
  runtimeConfiguration?: Partial<AiEmployeeRuntimeConfiguration>;
  disabledToolKeys?: string[];
};
