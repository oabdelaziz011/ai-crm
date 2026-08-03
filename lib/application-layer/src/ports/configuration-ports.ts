import type {
  ConfigurationRecord,
  ConfigurationVersionRecord,
  ConfigurationSaveDraftInput,
  ConfigurationPublishInput,
  ConfigurationRollbackInput,
} from "@workspace/configuration-platform";

export type ConfigurationReadPort = {
  get(tenantId: string, domain: string, scopeKey?: string): Promise<ConfigurationRecord | null>;
  getPublished(tenantId: string, domain: string, scopeKey?: string): Promise<ConfigurationRecord | null>;
  listVersions(tenantId: string, configurationId: string, limit?: number): Promise<readonly ConfigurationVersionRecord[]>;
  getVersion(tenantId: string, configurationId: string, version: number): Promise<ConfigurationVersionRecord | null>;
};

export type ConfigurationWritePort = {
  saveDraft(input: ConfigurationSaveDraftInput): Promise<ConfigurationRecord>;
  publish(input: ConfigurationPublishInput): Promise<ConfigurationRecord>;
  rollback(input: ConfigurationRollbackInput): Promise<ConfigurationRecord>;
};

export type ConfigurationCachePort = {
  buildKey(tenantId: string, domain: string, scopeKey: string): string;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  invalidate(key: string): Promise<void>;
  invalidateTenant(tenantId: string): Promise<void>;
};

export type { ConfigurationRecord, ConfigurationVersionRecord };
