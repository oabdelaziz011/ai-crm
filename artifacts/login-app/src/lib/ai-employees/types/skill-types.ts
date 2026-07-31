export type AiSkillStatus = "draft" | "published" | "archived";

export type AiSkillVersionStatus = "published" | "superseded" | "rolled_back";

export type AiSkillDeploymentStatus = "active" | "superseded" | "rolled_back";

export type AiSkillChangeEventType =
  | "created"
  | "updated"
  | "published"
  | "rolled_back"
  | "archived"
  | "restored"
  | "dependency_added"
  | "dependency_removed"
  | "assigned"
  | "unassigned"
  | "tested";

export type AiSkillRuntimeRecommendations = {
  memoryMode?: string;
  confirmationPolicy?: string;
  streaming?: boolean;
  topK?: number;
  minScore?: number;
};

export type AiSkillDocumentation = {
  overview?: string;
  inputs?: string[];
  outputs?: string[];
};

export type AiSkillDbRow = {
  id: string;
  company_id: string;
  key: string;
  name: string;
  display_name: string;
  description: string;
  category: string;
  tags: string[];
  tool_keys: string[];
  required_permissions: string[];
  required_knowledge_ids: string[];
  runtime_recommendations: Record<string, unknown>;
  documentation: Record<string, unknown>;
  status: AiSkillStatus;
  published_version_id: string | null;
  current_version_number: number;
  has_unpublished_draft: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type AiSkillRecord = {
  id: string;
  key: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  toolKeys: string[];
  requiredPermissions: string[];
  requiredKnowledgeIds: string[];
  runtimeRecommendations: AiSkillRuntimeRecommendations;
  documentation: AiSkillDocumentation;
  status: AiSkillStatus;
  publishedVersionId: string | null;
  currentVersionNumber: number;
  hasUnpublishedDraft: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AiSkillVersionSnapshot = {
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  toolKeys: string[];
  requiredPermissions: string[];
  requiredKnowledgeIds: string[];
  runtimeRecommendations: AiSkillRuntimeRecommendations;
  documentation: AiSkillDocumentation;
};

export type AiSkillVersionRecord = {
  id: string;
  companyId: string;
  skillId: string;
  versionNumber: number;
  status: AiSkillVersionStatus;
  snapshot: AiSkillVersionSnapshot;
  publishNotes: string;
  createdAt: string;
  createdBy: string | null;
  publishedAt: string;
  publishedBy: string | null;
};

export type AiSkillDeploymentRecord = {
  id: string;
  companyId: string;
  skillId: string;
  versionId: string;
  versionNumber: number;
  status: AiSkillDeploymentStatus;
  publishNotes: string;
  publishedAt: string;
  publishedBy: string | null;
};

export type AiSkillChangeEventRecord = {
  id: string;
  companyId: string;
  skillId: string;
  eventType: AiSkillChangeEventType;
  metadata: Record<string, unknown>;
  createdAt: string;
  createdBy: string | null;
};

export type AiSkillDependencyRecord = {
  id: string;
  skillId: string;
  dependsOnSkillId: string;
  dependsOnDisplayName?: string;
};

export type AiSkillListFilter = {
  status?: AiSkillStatus | "all";
  category?: string | "all";
  tags?: string[];
  search?: string;
  favoritesOnly?: boolean;
};

export type AiSkillFormValues = {
  key: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  toolKeys: string[];
  requiredPermissions: string[];
  requiredKnowledgeIds: string[];
  runtimeRecommendations: AiSkillRuntimeRecommendations;
  documentation: AiSkillDocumentation;
};

export type AiSkillValidationIssue = {
  field: string;
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type AiSkillValidationResult = {
  ready: boolean;
  issues: AiSkillValidationIssue[];
};

export type AiSkillReadinessCategory = {
  id: "tools" | "permissions" | "knowledge" | "dependencies" | "lifecycle" | "documentation";
  label: string;
  ready: boolean;
  missing: string[];
};

export type AiSkillReadinessScore = {
  score: number;
  ready: boolean;
  categories: AiSkillReadinessCategory[];
};

export type AiSkillAnalytics = {
  assignmentCount: number;
  usageCount: number;
  successRate: number;
  averageExecutionTimeMs: number;
  failureCount: number;
};

export type AiSkillMarketplaceEntry = AiSkillRecord & {
  isFavorite: boolean;
  analytics: AiSkillAnalytics;
  dependencyCount: number;
  readiness: AiSkillReadinessScore;
};

export type AiSkillPlatformSnapshot = {
  assignedSkills: AiSkillRecord[];
  marketplace: AiSkillMarketplaceEntry[];
  categories: string[];
  recentlyUsedSkillIds: string[];
  effectiveToolKeys: string[];
  readiness: AiSkillReadinessScore;
  validation: AiSkillValidationResult;
  documentation: AiSkillDocumentationView | null;
  analytics: AiSkillAnalytics;
  dependencies: AiSkillDependencyRecord[];
  circularDependencyPaths: string[][];
  versions: AiSkillVersionRecord[];
};

export type AiSkillDocumentationView = {
  overview: string;
  inputs: string[];
  outputs: string[];
  requiredTools: string[];
  requiredPermissions: string[];
  dependencies: string[];
  versionLabel: string;
};

export type PublishAiSkillInput = {
  skillId: string;
  companyId: string;
  publishNotes?: string;
  actorId?: string | null;
};

export type RollbackAiSkillInput = {
  skillId: string;
  companyId: string;
  versionNumber: number;
  actorId?: string | null;
};
