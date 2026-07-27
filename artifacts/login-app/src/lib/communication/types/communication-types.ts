import type {
  CommunicationChannel,
  CommunicationQueueStatus,
  CommunicationTemplateKey,
  DomainEventName,
  ReminderOffset,
} from "@/lib/communication/types/communication-enums";

export type CommunicationRecipient = {
  customerId?: string | null;
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  language?: string | null;
};

export type CommunicationSendRequest = {
  companyId: string;
  templateKey: CommunicationTemplateKey;
  channels: CommunicationChannel[];
  recipient: CommunicationRecipient;
  variables?: Record<string, string>;
  scheduledAt?: string;
  idempotencyKey?: string;
  sourceEvent?: DomainEventName;
  metadata?: Record<string, unknown>;
};

export type CommunicationSendResult = {
  messageIds: string[];
  queueIds: string[];
  skippedChannels: CommunicationChannel[];
  deduplicated: boolean;
};

export type CommunicationQueueItem = {
  id: string;
  companyId: string;
  notificationId: string | null;
  channel: CommunicationChannel;
  status: CommunicationQueueStatus;
  retryCount: number;
  scheduledAt: string;
  processedAt: string | null;
  lastError: string | null;
  templateKey: string | null;
  recipient: string | null;
  provider: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CommunicationHistoryEntry = {
  id: string;
  companyId: string;
  channel: CommunicationChannel;
  recipient: string;
  templateKey: string;
  status: CommunicationQueueStatus;
  provider: string | null;
  deliveryTime: string | null;
  retryCount: number;
  failureReason: string | null;
  createdAt: string;
};

export type CommunicationCenterStats = {
  sentToday: number;
  delivered: number;
  queued: number;
  failed: number;
  retrying: number;
};

export type CustomerCommunicationPreferences = {
  customerId: string;
  companyId: string;
  receiveWhatsapp: boolean;
  receiveEmail: boolean;
  receiveSms: boolean;
  receiveMarketing: boolean;
  language: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
};

export type CommunicationReminderSchedule = {
  id: string;
  companyId: string;
  templateKey: CommunicationTemplateKey;
  offset: ReminderOffset;
  channel: CommunicationChannel;
  enabled: boolean;
  referenceType: string;
  referenceId: string;
  scheduledAt: string;
  timezone: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "cancelled" | "failed";
};

export type CommunicationTemplateDefinition = {
  key: CommunicationTemplateKey;
  notificationEvent: string;
  category: string;
  version: number;
  supportedChannels: CommunicationChannel[];
  variableKeys: string[];
  titleKey: string;
  bodyKey: string;
};

export type CommunicationHistoryFilter = {
  dateFrom?: string;
  dateTo?: string;
  channel?: CommunicationChannel;
  status?: CommunicationQueueStatus;
  templateKey?: string;
  customerId?: string;
  search?: string;
};
