import type { AiEmployeeFormValues, AiEmployeeInsert, AiEmployeeUpdate } from "@/lib/ai-employees/types";
import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "@/lib/ai-employees/adapters";
import { normalizeAiEmployeeWelcomeMessageForStorage } from "@/lib/ai-employees/utilities/resolve-ai-employee-welcome-message";
import {
  summarizeKnowledge,
  summarizeSystemPrompt,
  summarizeTools,
} from "@/lib/ai-employees/selectors";

/** Slug for the technical internal name (ASCII first, unicode letters as fallback). */
export function normalizeAiEmployeeName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return "";

  const ascii = trimmed
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii;

  // Arabic / other scripts: keep letters & numbers so create is not blocked.
  return trimmed
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Prefer typed internal name; otherwise derive a stable slug from the display name. */
export function resolveAiEmployeeInternalName(
  name: string | null | undefined,
  displayName: string | null | undefined,
): string {
  const fromName = normalizeAiEmployeeName(name ?? "");
  if (fromName) return fromName;
  const fromDisplay = normalizeAiEmployeeName(displayName ?? "");
  if (fromDisplay) return fromDisplay;
  return `employee-${Date.now().toString(36)}`;
}

export function formValuesToInsert(
  companyId: string,
  values: AiEmployeeFormValues,
  knowledgeNames: string[],
  actorId?: string | null,
): AiEmployeeInsert {
  const name = resolveAiEmployeeInternalName(values.name, values.displayName);
  return {
    company_id: companyId,
    name,
    display_name: values.displayName.trim(),
    description: values.description.trim(),
    avatar: values.avatar?.trim() || null,
    department: values.department?.trim() || null,
    owner_id: values.ownerId,
    // Lifecycle Publish owns "published"; create always starts as draft.
    status: "draft",
    provider: values.provider?.trim() || null,
    model: values.model?.trim() || null,
    temperature: values.temperature,
    max_tokens: values.maxTokens,
    system_prompt: values.systemPrompt.trim(),
    system_prompt_summary: summarizeSystemPrompt(values.systemPrompt),
    welcome_message: normalizeAiEmployeeWelcomeMessageForStorage(values.welcomeMessage),
    knowledge_source_ids: values.knowledgeSourceIds,
    knowledge_summary: summarizeKnowledge(knowledgeNames),
    allowed_tool_keys: values.allowedToolKeys,
    tool_summary: summarizeTools(values.allowedToolKeys),
    allowed_skill_ids: values.allowedSkillIds ?? [],
    skills_summary: "",
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
): AiEmployeeUpdate {
  const name = resolveAiEmployeeInternalName(values.name, values.displayName);
  const base: AiEmployeeUpdate = {
    name,
    display_name: values.displayName.trim(),
    description: values.description.trim(),
    avatar: values.avatar?.trim() || null,
    department: values.department?.trim() || null,
    owner_id: values.ownerId,
    provider: values.provider?.trim() || null,
    model: values.model?.trim() || null,
    temperature: values.temperature,
    max_tokens: values.maxTokens,
    system_prompt: values.systemPrompt.trim(),
    system_prompt_summary: summarizeSystemPrompt(values.systemPrompt),
    welcome_message: normalizeAiEmployeeWelcomeMessageForStorage(values.welcomeMessage),
    knowledge_source_ids: values.knowledgeSourceIds,
    knowledge_summary: summarizeKnowledge(knowledgeNames),
    allowed_tool_keys: values.allowedToolKeys,
    tool_summary: summarizeTools(values.allowedToolKeys),
    allowed_skill_ids: values.allowedSkillIds ?? [],
    tags: values.tags.map((tag) => tag.trim()).filter(Boolean),
    updated_by: actorId ?? null,
  };

  // Do not let the edit form shadow-publish or un-publish; lifecycle panel owns that.
  if (values.status === "published" || values.status === "archived") {
    return base;
  }

  return {
    ...base,
    status: values.status === "disabled" ? "disabled" : "draft",
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
  welcomeMessage: string;
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
    welcomeMessage: record.welcomeMessage,
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
  welcomeMessage: "",
  knowledgeSourceIds: [],
  allowedToolKeys: [],
  allowedSkillIds: [],
  tags: [],
};
