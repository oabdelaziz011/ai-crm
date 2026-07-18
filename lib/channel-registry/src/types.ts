import type {
  ChannelHealthStatus,
  CommunicationChannelKey,
  CompanyChannelStatus,
} from "./constants.js";

export type CommunicationChannelRecord = {
  id: string;
  key: CommunicationChannelKey;
  display_name: string;
  description: string;
  icon: string | null;
  supports_media: boolean;
  supports_templates: boolean;
  supports_reactions: boolean;
  supports_typing: boolean;
  supports_read_receipts: boolean;
  supports_delivery_receipts: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CompanyChannelRecord = {
  id: string;
  company_id: string;
  channel_id: string;
  display_name: string;
  status: CompanyChannelStatus;
  provider: string;
  configuration: Record<string, unknown>;
  webhook_url: string | null;
  webhook_secret: string | null;
  external_account_id: string | null;
  is_default: boolean;
  is_enabled: boolean;
  health_status: ChannelHealthStatus;
  last_health_check: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  communication_channel?: CommunicationChannelRecord | null;
};

export type CreateCompanyChannelInput = {
  companyId: string;
  channelId: string;
  displayName: string;
  provider?: string;
  configuration?: Record<string, unknown>;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  externalAccountId?: string | null;
  isDefault?: boolean;
  isEnabled?: boolean;
  status?: CompanyChannelStatus;
  healthStatus?: ChannelHealthStatus;
};

export type UpdateCompanyChannelConfigurationInput = {
  companyChannelId: string;
  configuration: Record<string, unknown>;
  provider?: string;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  externalAccountId?: string | null;
  displayName?: string;
};

export type UpdateCompanyChannelHealthInput = {
  companyChannelId: string;
  healthStatus: ChannelHealthStatus;
  lastHealthCheck?: string | null;
};

export type ListCompanyChannelsFilter = {
  companyId: string;
  isEnabled?: boolean;
  healthStatus?: ChannelHealthStatus;
  channelKey?: CommunicationChannelKey;
};

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};
