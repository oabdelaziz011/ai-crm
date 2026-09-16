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
import {
  MicrosoftGraphEmailClient,
  mapGraphMessageToInboundRecord,
} from "../adapters/email/microsoft-graph-email-client.js";
import { EMAIL_PROVIDER_ERROR_CODES } from "../adapters/email/email-provider-contract.js";
import { ensureFreshMicrosoftAccessToken } from "../adapters/email/microsoft-token-refresh.js";
import type { EmailChannelConfiguration } from "../adapters/email/email-config.js";
import { ValidationError } from "../errors.js";
import {
  evaluateEmailInboundAutoReplyGuard,
  normalizeEmailAddress,
  normalizeInboundExternalMessageId,
} from "../adapters/email/email-inbound-auto-reply-guard.js";

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
  microsoftGraphClient?: MicrosoftGraphEmailClient;
  inboundAdapter?: EmailInboundAdapter;
  onDiagnostic?: (detail: Record<string, unknown>) => void;
  refreshMicrosoftToken?: (
    config: EmailChannelConfiguration,
    companyId: string,
  ) => Promise<EmailChannelConfiguration>;
  /** Optional commercial gate — skip channel when entitlement fails. */
  assertCommercialAccess?: (companyId: string) => Promise<void>;
};

export function createEmailPollingWorker(deps: EmailPollingWorkerDeps) {
  const inboundAdapter = deps.inboundAdapter ?? new EmailInboundAdapter();
  const microsoftGraphClient = deps.microsoftGraphClient ?? new MicrosoftGraphEmailClient();
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
        deps.onDiagnostic?.({
          stage: "email.poll.skipped",
          reason: "conversation_disabled",
          companyChannelId: input.companyChannelId,
          companyId: input.companyId,
        });
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

      const inboundProvider = runtimeConfig.inboundProvider ?? "imap";

      // Microsoft 365 — Graph API fetch (no Basic Auth IMAP).
      if (inboundProvider === "microsoft_graph") {
        let graphConfig = runtimeConfig;
        try {
          const refresher =
            deps.refreshMicrosoftToken ??
            ((config: EmailChannelConfiguration, companyId: string) =>
              ensureFreshMicrosoftAccessToken({
                config,
                companyId,
                client: deps.client,
              }));
          graphConfig = await refresher(runtimeConfig, input.companyId);
        } catch (error) {
          const message =
            error instanceof ValidationError
              ? error.message
              : error instanceof Error
                ? error.message
                : EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED;
          deps.onDiagnostic?.({
            stage: "email.poll.skipped",
            reason: "microsoft_oauth_refresh_failed",
            companyChannelId: input.companyChannelId,
          });
          await deps.client.rpc("update_company_email_connection_status", {
            p_company_id: input.companyId,
            p_status: "needs_reauthorization",
            p_last_error:
              message === EMAIL_PROVIDER_ERROR_CODES.OAUTH_NOT_CONFIGURED
                ? EMAIL_PROVIDER_ERROR_CODES.OAUTH_NOT_CONFIGURED
                : EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED,
          });
          return { processed: 0, lastUid: credentials.imapLastUid ?? 0 };
        }

        const accessToken = graphConfig.oauthAccessToken?.trim() || "";
        if (!accessToken) {
          deps.onDiagnostic?.({
            stage: "email.poll.skipped",
            reason: "microsoft_oauth_missing",
            companyChannelId: input.companyChannelId,
          });
          await deps.client.rpc("update_company_email_connection_status", {
            p_company_id: input.companyId,
            p_status: "needs_reauthorization",
            p_last_error: EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED,
          });
          return { processed: 0, lastUid: credentials.imapLastUid ?? 0 };
        }

        let list;
        try {
          list = await microsoftGraphClient.listInboxMessages({ accessToken });
        } catch (error) {
          const message =
            error instanceof ValidationError ? error.message : EMAIL_PROVIDER_ERROR_CODES.CONNECT_FAILED;
          await deps.client.rpc("update_company_email_connection_status", {
            p_company_id: input.companyId,
            p_status:
              message === EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED
                ? "needs_reauthorization"
                : "connection_error",
            p_last_error: message,
          });
          throw error;
        }

        let processed = 0;
        for (const graphMessage of list.messages) {
          try {
            const record = mapGraphMessageToInboundRecord(graphMessage);
            if (
              graphMessage.hasAttachments === true &&
              typeof graphMessage.id === "string" &&
              graphMessage.id.trim() &&
              (!Array.isArray(record.attachments) || record.attachments.length === 0)
            ) {
              try {
                record.attachments = await microsoftGraphClient.listMessageAttachments(
                  { accessToken },
                  graphMessage.id,
                );
              } catch (error) {
                deps.onDiagnostic?.({
                  stage: "email.poll.attachments_failed",
                  provider: "microsoft_graph",
                  companyChannelId: input.companyChannelId,
                  message:
                    error instanceof Error ? error.message : "email_poll_attachments_failed",
                });
              }
            }
            const parsed = await inboundAdapter.parseStructuredInbound(record);
            await this.processInboundEmail({
              companyChannelId: input.companyChannelId,
              companyId: input.companyId,
              parsed,
              executeAi: input.executeAi,
            });
            processed += 1;
          } catch (error) {
            deps.onDiagnostic?.({
              stage: "email.poll.message_failed",
              provider: "microsoft_graph",
              companyChannelId: input.companyChannelId,
              companyId: input.companyId,
              message:
                error instanceof Error ? error.message : "email_poll_message_failed",
            });
            // Continue remaining inbox messages — one poison item must not block the mailbox.
          }
        }

        await deps.client.rpc("update_company_email_connection_status", {
          p_company_id: input.companyId,
          p_status: "connected",
          p_last_error: "",
          p_synced_at: new Date().toISOString(),
        });

        deps.onDiagnostic?.({
          stage: "email.poll.completed",
          companyChannelId: input.companyChannelId,
          provider: "microsoft_graph",
          processed,
        });

        return { processed, lastUid: credentials.imapLastUid ?? 0 };
      }

      // Gmail + generic IMAP/SMTP — existing IMAP path.
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
      let maxUidSeen = credentials.imapLastUid ?? 0;
      for (const message of fetchResult.messages) {
        if (typeof message.uid === "number" && message.uid > maxUidSeen) {
          maxUidSeen = message.uid;
        }
        try {
          await this.processInboundEmail({
            companyChannelId: input.companyChannelId,
            companyId: input.companyId,
            parsed: message,
            executeAi: input.executeAi,
          });
          processed += 1;
        } catch (error) {
          deps.onDiagnostic?.({
            stage: "email.poll.message_failed",
            provider: "imap",
            companyChannelId: input.companyChannelId,
            companyId: input.companyId,
            uid: message.uid ?? null,
            message:
              error instanceof Error ? error.message : "email_poll_message_failed",
          });
          // Continue — advance cursor past poison so later mail is not stuck forever.
        }
      }

      const cursorUid = Math.max(fetchResult.lastUid, maxUidSeen);
      if (cursorUid > (credentials.imapLastUid ?? 0)) {
        await deps.client.rpc("update_company_email_imap_cursor", {
          p_company_id: input.companyId,
          p_last_uid: cursorUid,
        });
      }

      await deps.client.rpc("update_company_email_connection_status", {
        p_company_id: input.companyId,
        p_status: "connected",
        p_last_error: "",
        p_synced_at: new Date().toISOString(),
      });

      deps.onDiagnostic?.({
        stage: "email.poll.completed",
        companyChannelId: input.companyChannelId,
        provider: "imap",
        processed,
        lastUid: cursorUid,
      });

      return { processed, lastUid: cursorUid };
    },

    async processInboundEmail(input: {
      companyChannelId: string;
      companyId: string;
      parsed: ParsedInboundEmail;
      executeAi?: boolean;
    }): Promise<void> {
      const credentials = await loadCompanyEmailCredentialsDecrypted(deps.client, input.companyId);
      const companyFromEmail = credentials?.fromEmail?.trim() || null;

      const normalizedMessageId = normalizeInboundExternalMessageId(input.parsed.messageId);
      let alreadyExistsAsOutgoing = false;
      let alreadyExistsAsIncoming = false;
      if (normalizedMessageId) {
        const { data: outgoingRows } = await deps.client
          .from("conversation_messages")
          .select("id, conversation_id")
          .eq("external_message_id", normalizedMessageId)
          .eq("message_type", "outgoing")
          .limit(10);
        const conversationIds = (outgoingRows ?? [])
          .map((row) => String((row as { conversation_id?: string }).conversation_id ?? ""))
          .filter(Boolean);
        if (conversationIds.length > 0) {
          const { data: companyConversations } = await deps.client
            .from("conversations")
            .select("id")
            .eq("company_id", input.companyId)
            .in("id", conversationIds)
            .limit(1);
          alreadyExistsAsOutgoing = Array.isArray(companyConversations) && companyConversations.length > 0;
        }

        // Acknowledgement claims keep external_message_id = valueor-ack:{id}; provider Message-ID
        // lives on channel_delivery_events — still treat as own outbound echo.
        if (!alreadyExistsAsOutgoing) {
          const { data: deliveryRows } = await deps.client
            .from("channel_delivery_events")
            .select("id")
            .eq("company_id", input.companyId)
            .eq("external_message_id", normalizedMessageId)
            .limit(1);
          alreadyExistsAsOutgoing = Array.isArray(deliveryRows) && deliveryRows.length > 0;
        }

        // Company-scoped inbound Message-ID dedupe. Unique index is only
        // (conversation_id, external_message_id), so a shared mailbox polled by two
        // company_channels — or an IMAP re-APPEND of the same provider id — would
        // otherwise create a second conversation + second ack attempt.
        if (!alreadyExistsAsOutgoing) {
          const { data: incomingRows } = await deps.client
            .from("conversation_messages")
            .select("id, conversation_id")
            .eq("external_message_id", normalizedMessageId)
            .eq("message_type", "incoming")
            .limit(50);
          const incomingConversationIds = (incomingRows ?? [])
            .map((row) => String((row as { conversation_id?: string }).conversation_id ?? ""))
            .filter(Boolean);
          if (incomingConversationIds.length > 0) {
            const { data: companyIncoming } = await deps.client
              .from("conversations")
              .select("id")
              .eq("company_id", input.companyId)
              .in("id", incomingConversationIds)
              .limit(1);
            alreadyExistsAsIncoming =
              Array.isArray(companyIncoming) && companyIncoming.length > 0;
          }
        }
      }

      const guard = evaluateEmailInboundAutoReplyGuard({
        fromEmail: input.parsed.from?.email,
        companyFromEmail,
        alreadyExistsAsOutgoing,
        alreadyExistsAsIncoming,
      });

      if (guard.skipPersist) {
        deps.onDiagnostic?.({
          stage: "email.poll.message_skipped",
          reason: guard.reason,
          companyChannelId: input.companyChannelId,
          companyId: input.companyId,
          messageId: normalizedMessageId || null,
          fromEmail: normalizeEmailAddress(input.parsed.from?.email) || null,
        });
        return;
      }

      const executeAi = Boolean(input.executeAi) && !guard.forceDisableAi;
      if (guard.forceDisableAi && input.executeAi) {
        deps.onDiagnostic?.({
          stage: "email.poll.ai_forced_off",
          reason: guard.reason,
          companyChannelId: input.companyChannelId,
          companyId: input.companyId,
          messageId: normalizedMessageId || null,
          fromEmail: normalizeEmailAddress(input.parsed.from?.email) || null,
        });
      }

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
        executeAi,
      });
    },

    async pollAllEnabledChannels(input?: { executeAi?: boolean }): Promise<Array<{ companyChannelId: string; processed: number }>> {
      const channels = await deps.ports.registry.listEnabledEmailChannels();
      const results: Array<{ companyChannelId: string; processed: number }> = [];

      for (const channel of channels) {
        if (deps.assertCommercialAccess) {
          try {
            await deps.assertCommercialAccess(channel.companyId);
          } catch (error) {
            deps.onDiagnostic?.({
              stage: "email.poll.skipped_commercial",
              companyChannelId: channel.id,
              companyId: channel.companyId,
              error: error instanceof Error ? error.message : String(error),
            });
            results.push({ companyChannelId: channel.id, processed: 0 });
            continue;
          }
        }

        try {
          const result = await this.pollCompanyChannel({
            companyChannelId: channel.id,
            companyId: channel.companyId,
            executeAi: input?.executeAi,
          });
          results.push({ companyChannelId: channel.id, processed: result.processed });
        } catch (error) {
          deps.onDiagnostic?.({
            stage: "email.poll.channel_failed",
            companyChannelId: channel.id,
            companyId: channel.companyId,
            error: error instanceof Error ? error.message : String(error),
          });
          results.push({ companyChannelId: channel.id, processed: 0 });
        }
      }

      return results;
    },
  };
}
