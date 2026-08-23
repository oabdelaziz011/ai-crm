import type { AiEmployeeRuntimeConfiguration } from "@/lib/ai-employees/adapters";

export type AiEmployeeLifecycleStatus = "draft" | "published" | "disabled" | "archived";

export type AiEmployeeVersionStatus = "published" | "superseded" | "rolled_back";

export type AiEmployeeDeploymentStatus = "active" | "superseded" | "rolled_back";

export type AiEmployeeChangeEventType =
  | "prompt_updated"
  | "knowledge_updated"
  | "tools_updated"
  | "runtime_updated"
  | "published"
  | "rolled_back"
  | "archived"
  | "restored"
  | "disabled"
  | "draft_saved";

export type AiEmployeeVersionSnapshot = {
  displayName: string;
  description: string;
  avatar: string | null;
  department: string | null;
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
  promptVersionLabel: string;
  runtimeConfiguration: AiEmployeeRuntimeConfiguration;
  tags: string[];
};

export type AiEmployeeVersionRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  versionNumber: number;
  status: AiEmployeeVersionStatus;
  snapshot: AiEmployeeVersionSnapshot;
  publishNotes: string;
  createdAt: string;
  createdBy: string | null;
  publishedAt: string;
  publishedBy: string | null;
};

export type AiEmployeeDeploymentRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  versionId: string;
  versionNumber: number;
  status: AiEmployeeDeploymentStatus;
  publishNotes: string;
  publishedAt: string;
  publishedBy: string | null;
};

export type AiEmployeeChangeEventRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  eventType: AiEmployeeChangeEventType;
  metadata: Record<string, unknown>;
  createdAt: string;
  createdBy: string | null;
};

export type AiEmployeeValidationCategory =
  | "prompt"
  | "provider"
  | "model"
  | "runtime"
  | "knowledge"
  | "tools"
  | "limits"
  | "permissions";

export type AiEmployeeValidationResult = {
  ready: boolean;
  issues: Array<{
    field: string;
    code: string;
    message: string;
    severity: "error" | "warning";
    category: AiEmployeeValidationCategory;
  }>;
};

export type AiEmployeeReadinessCategory = {
  id: AiEmployeeValidationCategory;
  label: string;
  ready: boolean;
  missing: string[];
};

export type AiEmployeeReadinessScore = {
  score: number;
  ready: boolean;
  categories: AiEmployeeReadinessCategory[];
};

export type AiEmployeeVersionComparisonSection = {
  section: "prompt" | "welcome" | "runtime" | "knowledge" | "tools" | "limits";
  changed: boolean;
  before: string;
  after: string;
};

export type AiEmployeeVersionComparison = {
  leftVersionNumber: number;
  rightVersionNumber: number;
  sections: AiEmployeeVersionComparisonSection[];
};

export type PublishAiEmployeeInput = {
  employeeId: string;
  companyId: string;
  publishNotes?: string;
  actorId?: string | null;
};

export type RollbackAiEmployeeInput = {
  employeeId: string;
  companyId: string;
  versionNumber: number;
  actorId?: string | null;
};
