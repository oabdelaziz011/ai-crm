import type {
  ExtensionPoint,
  PluginCategory,
  PluginHealthStatus,
  PluginHookType,
  PluginInstallationStatus,
  PluginPermission,
  PluginEventType,
} from "@/lib/plugins/types/plugin-enums";

export type PluginManifest = {
  pluginId: string;
  name: string;
  author: string;
  version: string;
  description?: string;
  category: PluginCategory;
  permissions: PluginPermission[];
  minPlatformVersion: string;
  maxPlatformVersion?: string;
  dependencies: string[];
  entryPoints: Record<string, string>;
  hooks: PluginHookType[];
  widgets?: string[];
  commands?: string[];
  settings?: Record<string, unknown>;
  assets?: string[];
  signatureHash?: string;
  events?: PluginEventType[];
  extensionPoints?: ExtensionPoint[];
};

export type PluginCatalogEntry = {
  id: string;
  pluginId: string;
  name: string;
  author: string;
  category: PluginCategory;
  description: string | null;
  isOfficial: boolean;
  latestVersion: string;
  permissions: PluginPermission[];
  minPlatformVersion: string;
};

export type PluginInstallation = {
  id: string;
  companyId: string;
  registryId: string;
  pluginId: string;
  pluginName: string;
  version: string;
  status: PluginInstallationStatus;
  grantedPermissions: PluginPermission[];
  settings: Record<string, unknown>;
  lastError: string | null;
  installedAt: string;
  enabledAt: string | null;
};

export type PluginHealthRecord = {
  installationId: string;
  pluginId: string;
  status: PluginHealthStatus;
  executionCount: number;
  errorCount: number;
  avgExecutionMs: number;
  lastExecutionAt: string | null;
  lastErrorMessage: string | null;
};

export type PluginAuditEntry = {
  id: string;
  companyId: string;
  pluginId: string;
  action: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type MarketplaceOverview = {
  installedCount: number;
  enabledCount: number;
  availableCount: number;
  updatesAvailable: number;
  unhealthyCount: number;
  totalExecutions24h: number;
};

export type PluginRuntimeContext = {
  companyId: string;
  installationId: string;
  pluginId: string;
  permissions: PluginPermission[];
  settings: Record<string, unknown>;
};

export type PluginExecutionResult = {
  success: boolean;
  output?: unknown;
  error?: string;
  executionMs: number;
};

export type PluginWidgetContribution = {
  pluginId: string;
  widgetId: string;
  title: string;
  category: PluginCategory;
  renderKey: string;
};

export type PluginNavigationContribution = {
  pluginId: string;
  label: string;
  path: string;
  icon?: string;
};

export type DependencyGraphNode = {
  pluginId: string;
  dependencies: string[];
  dependents: string[];
};

export type ManifestValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};
