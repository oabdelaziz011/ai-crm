import type { AiEmployeeFormValues } from "@/lib/ai-employees/types";
import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "@/lib/ai-employees/adapters";
import {
  summarizeKnowledge,
  summarizeSystemPrompt,
  summarizeTools,
} from "@/lib/ai-employees/selectors";

export function normalizeAiEmployeeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formValuesToInsert(
  companyId: string,
  values: AiEmployeeFormValues,
  knowledgeNames: string[],
  actorId?: string | null,
) {
  const name = normalizeAiEmployeeName(values.name);
  return {
    company_id: companyId,
    name,
    display_name: values.displayName.trim(),
    description: values.description.trim(),
    avatar: values.avatar,
    department: values.department?.trim() || null,
    owner_id: values.ownerId,
    status: values.status,
    provider: values.provider?.trim() || null,
    model: values.model?.trim() || null,
    temperature: values.temperature,
    max_tokens: values.maxTokens,
    system_prompt: values.systemPrompt.trim(),
    system_prompt_summary: summarizeSystemPrompt(values.systemPrompt),
    knowledge_source_ids: values.knowledgeSourceIds,
    knowledge_summary: summarizeKnowledge(knowledgeNames),
    allowed_tool_keys: values.allowedToolKeys,
    tool_summary: summarizeTools(values.allowedToolKeys),
    allowed_skill_ids: values.allowedSkillIds ?? [],
    skills_summary: "No skills assigned",
    tags: values.tags.map((tag) => tag.trim()).filter(Boolean),
    prompt_version_label: "v1",
    runtime_configuration: DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
    published_version_id: null,
    current_version_number: 0,
    has_unpublished_draft: true,
    created_by: actorId ?? null,
    updated_by: actorId ?? null,
  };
}

export function formValuesToUpdate(
  values: AiEmployeeFormValues,
  knowledgeNames: string[],
  actorId?: string | null,
) {
  const name = normalizeAiEmployeeName(values.name);
  return {
    name,
    display_name: values.displayName.trim(),
    description: values.description.trim(),
    avatar: values.avatar,
    department: values.department?.trim() || null,
    owner_id: values.ownerId,
    status: values.status,
    provider: values.provider?.trim() || null,
    model: values.model?.trim() || null,
    temperature: values.temperature,
    max_tokens: values.maxTokens,
    system_prompt: values.systemPrompt.trim(),
    system_prompt_summary: summarizeSystemPrompt(values.systemPrompt),
    knowledge_source_ids: values.knowledgeSourceIds,
    knowledge_summary: summarizeKnowledge(knowledgeNames),
    allowed_tool_keys: values.allowedToolKeys,
    tool_summary: summarizeTools(values.allowedToolKeys),
    allowed_skill_ids: values.allowedSkillIds ?? [],
    skills_summary: "No skills assigned",
    tags: values.tags.map((tag) => tag.trim()).filter(Boolean),
    updated_by: actorId ?? null,
  };
}

export function recordToFormValues(record: {
  name: string;
  displayName: string;
  description: string;
  avatar: string | null;
  department: string | null;
  ownerId: string | null;
  status: AiEmployeeFormValues["status"];
  provider: string | null;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  systemPrompt: string;
  knowledgeSourceIds: string[];
  allowedToolKeys: string[];
  allowedSkillIds: string[];
  tags: string[];
}): AiEmployeeFormValues {
  return {
    name: record.name,
    displayName: record.displayName,
    description: record.description,
    avatar: record.avatar,
    department: record.department,
    ownerId: record.ownerId,
    status: record.status,
    provider: record.provider,
    model: record.model,
    temperature: record.temperature,
    maxTokens: record.maxTokens,
    systemPrompt: record.systemPrompt,
    knowledgeSourceIds: record.knowledgeSourceIds,
    allowedToolKeys: record.allowedToolKeys,
    allowedSkillIds: record.allowedSkillIds,
    tags: record.tags,
  };
}

export const DEFAULT_AI_EMPLOYEE_FORM: AiEmployeeFormValues = {
  name: "",
  displayName: "",
  description: "",
  avatar: null,
  department: null,
  ownerId: null,
  status: "draft",
  provider: null,
  model: null,
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: "",
  knowledgeSourceIds: [],
  allowedToolKeys: [],
  allowedSkillIds: [],
  tags: [],
};
