import type {
  ConfigurationDomain,
  ConfigurationStatus,
  ConfigurationVersionAction,
  MetadataFieldType,
} from "./constants.js";

export type MetadataFieldDefinition = Readonly<{
  key: string;
  label: string;
  type: MetadataFieldType;
  required?: boolean;
  defaultValue?: unknown;
  validation?: Readonly<Record<string, unknown>>;
  visibleToRoles?: readonly string[];
  localized?: boolean;
}>;

export type ConfigurationRecord = Readonly<{
  id: string;
  tenantId: string;
  domain: ConfigurationDomain | string;
  scopeKey: string;
  status: ConfigurationStatus;
  version: number;
  publishedConfig: Record<string, unknown>;
  draftConfig: Record<string, unknown> | null;
  publishedAt: string | null;
  publishedBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
}>;

export type ConfigurationVersionRecord = Readonly<{
  id: string;
  configurationId: string;
  tenantId: string;
  version: number;
  config: Record<string, unknown>;
  action: ConfigurationVersionAction;
  changeSummary: string | null;
  actorId: string | null;
  createdAt: string;
}>;

export type ConfigurationSaveDraftInput = Readonly<{
  tenantId: string;
  domain: string;
  scopeKey: string;
  config: Record<string, unknown>;
  actorId: string;
  changeSummary?: string;
}>;

export type ConfigurationPublishInput = Readonly<{
  tenantId: string;
  domain: string;
  scopeKey: string;
  actorId: string;
  changeSummary?: string;
}>;

export type ConfigurationRollbackInput = Readonly<{
  tenantId: string;
  configurationId: string;
  targetVersion: number;
  actorId: string;
}>;
