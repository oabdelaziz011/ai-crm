import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelPlatformServices } from "../index.js";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { ServiceContext } from "../types.js";
import { EmailImapClient } from "../adapters/email/email-imap-client.js";
import { EmailInboundAdapter } from "../adapters/email/email-inbound-adapter.js";
import {
  loadCompanyEmailCredentialsDecrypted,
  resolveEmailRuntimeConfiguration,
} from "../adapters/email/email-canonical-credentials.js";
import { parseEmailChannelReferences } from "../adapters/email/email-config.js";
import { resolveEmailThread, type EmailThreadLookupPort } from "../adapters/email/email-thread-resolver.js";
import { createEmailWebhookHandler } from "../webhooks/email-webhook-handler.js";
import { resolveEmailCompanyChannel } from "../webhooks/email-company-channel.js";
import type { ParsedInboundEmail } from "../adapters/email/email-types.js";

export type EmailPollingWorkerDeps = {
  client: SupabaseClient;
  services: ChannelPlatformServices;
  ports: ChannelPlatformPorts;
  resolveSystemContext: () => ServiceContext;
  resolveRuntimeConfig?: (companyId: string) => Promise<{
    providerConnectionId: string;
    aiAssistantId: string;
    knowledgeRetrieval?: {
      embeddingConnectionId: string;
      vectorStoreConnectionId: string;
      collectionId: string;
    } | null;
  } | null>;
  threadLookup: EmailThreadLookupPort;
  imapClient: EmailImapClient;
  inboundAdapter?: EmailInboundAdapter;
  onDiagnostic?: (detail: Record<string, unknown>) => void;
};

export function createEmailPollingWorker(deps: EmailPollingWorkerDeps) {
  const inboundAdapter = deps.inboundAdapter ?? new EmailInboundAdapter();
  const emailHandler = createEmailWebhookHandler({
    services: deps.services,
    ports: deps.ports,
    resolveSystemContext: deps.resolveSystemContext,
    resolveCompanyChannel: (companyChannelId) =>
      resolveEmailCompanyChannel(deps.ports, companyChannelId),
    resolveRuntimeConfig: deps.resolveRuntimeConfig,
    threadLookup: deps.threadLookup,
    inboundAdapter,
  });

  return {
    async pollCompanyChannel(input: {
      companyChannelId: string;
      companyId: string;
      executeAi?: boolean;
    }): Promise<{ processed: number; lastUid: number }> {
      const credentials = await loadCompanyEmailCredentialsDecrypted(deps.client, input.companyId);
      if (!credentials?.conversationEnabled) {
        return { processed: 0, lastUid: credentials?.imapLastUid ?? 0 };
      }

      const channel = await deps.client
        .from("company_channels")
        .select("configuration")
        .eq("id", input.companyChannelId)
        .maybeSingle();

      const runtimeConfig = await resolveEmailRuntimeConfiguration(
        input.companyId,
        parseEmailChannelReferences((channel.data?.configuration as Record<string, unknown>) ?? {}),
        { loadByCompanyId: async () => credentials },
      );

      if (!runtimeConfig.imapHost?.trim()) {
        deps.onDiagnostic?.({
          stage: "email.poll.skipped",
          reason: "imap_not_configured",
          companyChannelId: input.companyChannelId,
        });
        return { processed: 0, lastUid: credentials.imapLastUid ?? 0 };
      }

      const fetchResult = await deps.imapClient.fetchNewMessages({
        config: runtimeConfig,
        lastUid: credentials.imapLastUid ?? 0,
        mailbox: runtimeConfig.imapMailbox,
      });

      let processed = 0;
      for (const message of fetchResult.messages) {
        await this.processInboundEmail({
          companyChannelId: input.companyChannelId,
          companyId: input.companyId,
          parsed: message,
          executeAi: input.executeAi,
        });
        processed += 1;
      }

      if (fetchResult.lastUid > (credentials.imapLastUid ?? 0)) {
        await deps.client.rpc("update_company_email_imap_cursor", {
          p_company_id: input.companyId,
          p_last_uid: fetchResult.lastUid,
        });
      }

      deps.onDiagnostic?.({
        stage: "email.poll.completed",
        companyChannelId: input.companyChannelId,
        processed,
        lastUid: fetchResult.lastUid,
      });

      return { processed, lastUid: fetchResult.lastUid };
    },

    async processInboundEmail(input: {
      companyChannelId: string;
      companyId: string;
      parsed: ParsedInboundEmail;
      executeAi?: boolean;
    }): Promise<void> {
      const webhookPayload = inboundAdapter.buildWebhookPayload(
        input.parsed,
        (
          await resolveEmailThread({
            messageId: input.parsed.messageId,
            inReplyTo: input.parsed.inReplyTo,
            references: input.parsed.references,
            fromEmail: input.parsed.from.email,
            subject: input.parsed.subject,
            companyChannelId: input.companyChannelId,
            lookup: deps.threadLookup,
          })
        ).externalThreadId,
      );

      await emailHandler.handlePost({
        companyChannelId: input.companyChannelId,
        rawPayload: webhookPayload,
        executeAi: input.executeAi,
      });
    },

    async pollAllEnabledChannels(input?: { executeAi?: boolean }): Promise<Array<{ companyChannelId: string; processed: number }>> {
      const channels = await deps.ports.registry.listEnabledEmailChannels();
      const results: Array<{ companyChannelId: string; processed: number }> = [];

      for (const channel of channels) {
        const result = await this.pollCompanyChannel({
          companyChannelId: channel.id,
          companyId: channel.companyId,
          executeAi: input?.executeAi,
        });
        results.push({ companyChannelId: channel.id, processed: result.processed });
      }

      return results;
    },
  };
}
