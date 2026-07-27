import type { CommunicationChannel } from "@/lib/communication/types";
import type {
  CommunicationSendRequest,
  CommunicationSendResult,
} from "@/lib/communication/types/communication-types";

export type ProviderSendContext = CommunicationSendRequest & {
  notificationEvent: string;
  renderedVariables: Record<string, string>;
};

export type ProviderSendOutcome = {
  queueId?: string;
  notificationId?: string;
  providerMessageId?: string | null;
  status: "queued" | "sent" | "failed";
  error?: string;
};

/** Pluggable channel provider — business logic never depends on implementation. */
export interface CommunicationProvider {
  readonly channel: CommunicationChannel;
  readonly providerName: string;
  send(context: ProviderSendContext): Promise<ProviderSendOutcome>;
  processQueue?(companyId: string, limit?: number): Promise<{ processed: number; failed: number }>;
  healthCheck?(companyId: string): Promise<{ ok: boolean; error?: string }>;
}

export type CommunicationProviderRegistry = {
  register(provider: CommunicationProvider): void;
  get(channel: CommunicationChannel): CommunicationProvider | null;
  send(request: CommunicationSendRequest): Promise<CommunicationSendResult>;
};
