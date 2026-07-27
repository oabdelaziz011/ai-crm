import type {
  CreatePromptTemplateInput,
  CreatePromptTemplateVersionInput,
  ListPromptTemplatesFilter,
  PromptBuildRecord,
  PromptTemplateRecord,
  PromptTemplateVersionRecord,
} from "../types.js";
import type { BuiltPromptSection, GatewayChatMessage, OutputContract, PromptMessagePlan } from "../types.js";

export interface PromptTemplateRepository {
  list(filter: ListPromptTemplatesFilter): Promise<PromptTemplateRecord[]>;
  findById(id: string): Promise<PromptTemplateRecord | null>;
  findByKey(companyId: string | null, key: string): Promise<PromptTemplateRecord | null>;
  findByType(companyId: string, templateType: string): Promise<PromptTemplateRecord | null>;
  create(input: CreatePromptTemplateInput): Promise<PromptTemplateRecord>;
  updateEnabled(templateId: string, isEnabled: boolean): Promise<PromptTemplateRecord>;
  setActiveVersion(templateId: string, versionId: string): Promise<PromptTemplateRecord>;
  setLifecycleState(
    templateId: string,
    patch: { hasUnpublishedDraft?: boolean },
  ): Promise<PromptTemplateRecord>;
}

export interface PromptTemplateVersionRepository {
  findById(id: string): Promise<PromptTemplateVersionRecord | null>;
  findActiveByTemplateId(templateId: string): Promise<PromptTemplateVersionRecord | null>;
  listByTemplateId(templateId: string): Promise<PromptTemplateVersionRecord[]>;
  create(input: CreatePromptTemplateVersionInput): Promise<PromptTemplateVersionRecord>;
  activate(templateId: string, versionId: string): Promise<PromptTemplateVersionRecord>;
}

export interface PromptBuildRepository {
  create(input: {
    companyId: string;
    conversationId?: string | null;
    templateId: string;
    templateVersionId: string;
    templateKey: string;
    templateType: string;
    sections: BuiltPromptSection[];
    finalPrompt: string;
    outputContract: OutputContract;
    messagePlan: PromptMessagePlan;
    gatewayMessages: GatewayChatMessage[];
    createdBy?: string | null;
  }): Promise<PromptBuildRecord>;
}
