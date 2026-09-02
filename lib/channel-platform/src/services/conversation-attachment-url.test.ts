import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PermissionDeniedError, ValidationError } from "../errors.js";
import { createChannelAdapterRegistry } from "../adapters/channel-adapter-registry.js";
import { createStubWebChatAdapter } from "../adapters/stub-web-chat-adapter.js";
import { DeliveryTrackingEngine } from "../engines/delivery-tracking-engine.js";
import { OutboundMessagePipeline } from "../pipelines/outbound-message-pipeline.js";
import type {
  ChannelDeliveryEventRepository,
  ChannelSessionRepository,
  CreateDeliveryEventInput,
  UpdateDeliveryEventInput,
} from "../repositories/channel-platform-repositories.js";
import type { ChannelAttachmentDto } from "../dto/channel-dto.js";
import type {
  ChannelDeliveryEventRecord,
  ChannelSessionRecord,
  ResolvedCompanyChannel,
} from "../types.js";
import { createContext } from "../test-utils.js";
import {
  CONVERSATION_ATTACHMENT_VIEW_PERMISSION,
  DEFAULT_CONVERSATION_ATTACHMENT_SIGNED_URL_SECONDS,
  createConversationAttachmentUrlPort,
  getConversationAttachmentSignedUrlSeconds,
  isConversationAttachmentsSignedUrl,
  isInternalConversationAttachmentStoragePath,
  parseConversationAttachmentStoragePath,
  resolveConversationAttachmentUrl,
  resolveOutboundAttachments,
} from "./conversation-attachment-url.js";

const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONV_A = "11111111-1111-4111-8111-111111111111";
const CONV_B = "22222222-2222-4222-8222-222222222222";
const PATH_A = `${COMPANY_A}/${CONV_A}/file-uuid-invoice.pdf`;
const PATH_MISMATCH = `${COMPANY_A}/${CONV_B}/file-uuid-invoice.pdf`;
const PATH_CROSS = `${COMPANY_B}/${CONV_A}/file-uuid-invoice.pdf`;

const __dirname = dirname(fileURLToPath(import.meta.url));

function authz(options?: {
  conversation?: { id: string; companyId: string } | null;
  signedUrls?: string[];
}) {
  const signedUrls = options?.signedUrls ?? [];
  let signCount = 0;
  return {
    authz: {
      loadLiveConversation: async () => options?.conversation ?? null,
      createSignedUrl: async (_path: string, _expires: number) => {
        const url = signedUrls[signCount] ?? `https://signed.example/${signCount + 1}`;
        signCount += 1;
        signedUrls[signCount - 1] = url;
        return url;
      },
    },
    getSignCount: () => signCount,
  };
}

describe("H3 conversation-attachment-url — path parsing", () => {
  it("parses valid internal storagePath", () => {
    const parsed = parseConversationAttachmentStoragePath(PATH_A);
    assert.deepEqual(parsed, { companyId: COMPANY_A, conversationId: CONV_A });
    assert.equal(isInternalConversationAttachmentStoragePath(PATH_A), true);
  });

  it("denies malformed storagePath", () => {
    assert.equal(parseConversationAttachmentStoragePath(""), null);
    assert.equal(parseConversationAttachmentStoragePath("a/b"), null);
    assert.equal(parseConversationAttachmentStoragePath("../x/y/z"), null);
    assert.equal(parseConversationAttachmentStoragePath("/abs/path/file"), null);
    assert.equal(parseConversationAttachmentStoragePath("not-uuid/also-bad/file.pdf"), null);
  });

  it("detects conversation-attachments signed URLs", () => {
    assert.equal(
      isConversationAttachmentsSignedUrl(
        "https://x.supabase.co/storage/v1/object/sign/conversation-attachments/a/b/c?token=t",
      ),
      true,
    );
    assert.equal(isConversationAttachmentsSignedUrl("https://cdn.meta.com/media/1"), false);
  });

  it("TTL is configurable and defaults to prior 7-day value (Meta window TBD)", () => {
    assert.equal(DEFAULT_CONVERSATION_ATTACHMENT_SIGNED_URL_SECONDS, 60 * 60 * 24 * 7);
    assert.equal(getConversationAttachmentSignedUrlSeconds(120), 120);
    assert.equal(getConversationAttachmentSignedUrlSeconds(), DEFAULT_CONVERSATION_ATTACHMENT_SIGNED_URL_SECONDS);
  });
});

describe("H3 conversation-attachment-url — authorization", () => {
  const ctxView = createContext({
    companyId: COMPANY_A,
    hasPermission: (code) => code === CONVERSATION_ATTACHMENT_VIEW_PERMISSION,
  });

  it("A/J. storagePath yields fresh signed URL", async () => {
    const { authz: deps } = authz({
      conversation: { id: CONV_A, companyId: COMPANY_A },
      signedUrls: ["https://signed.example/fresh-1"],
    });
    const url = await resolveConversationAttachmentUrl({
      companyId: COMPANY_A,
      conversationId: CONV_A,
      storagePath: PATH_A,
      ctx: ctxView,
      authz: deps,
      expiresInSeconds: 120,
    });
    assert.equal(url, "https://signed.example/fresh-1");
  });

  it("B. persisted attachment_url is irrelevant when storagePath is resolved", async () => {
    const { authz: deps } = authz({
      conversation: { id: CONV_A, companyId: COMPANY_A },
      signedUrls: ["https://signed.example/from-path"],
    });
    const url = await resolveConversationAttachmentUrl({
      companyId: COMPANY_A,
      conversationId: CONV_A,
      storagePath: PATH_A,
      ctx: ctxView,
      authz: deps,
    });
    assert.equal(url, "https://signed.example/from-path");
    assert.notEqual(url, "https://legacy-persisted.example/old");
  });

  it("C. unauthorized conversation denied", async () => {
    const ctx = createContext({
      companyId: COMPANY_A,
      hasPermission: () => false,
    });
    const { authz: deps } = authz({
      conversation: { id: CONV_A, companyId: COMPANY_A },
    });
    await assert.rejects(
      () =>
        resolveConversationAttachmentUrl({
          companyId: COMPANY_A,
          conversationId: CONV_A,
          storagePath: PATH_A,
          ctx,
          authz: deps,
        }),
      (err: unknown) => err instanceof PermissionDeniedError,
    );
  });

  it("D. cross-company path denied", async () => {
    const { authz: deps } = authz({
      conversation: { id: CONV_A, companyId: COMPANY_A },
    });
    await assert.rejects(
      () =>
        resolveConversationAttachmentUrl({
          companyId: COMPANY_A,
          conversationId: CONV_A,
          storagePath: PATH_CROSS,
          ctx: ctxView,
          authz: deps,
        }),
      (err: unknown) => err instanceof PermissionDeniedError,
    );
  });

  it("E. path/conversation mismatch denied", async () => {
    const { authz: deps } = authz({
      conversation: { id: CONV_A, companyId: COMPANY_A },
    });
    await assert.rejects(
      () =>
        resolveConversationAttachmentUrl({
          companyId: COMPANY_A,
          conversationId: CONV_A,
          storagePath: PATH_MISMATCH,
          ctx: ctxView,
          authz: deps,
        }),
      (err: unknown) => err instanceof PermissionDeniedError,
    );
  });

  it("F. missing/deleted conversation denied", async () => {
    const { authz: deps } = authz({ conversation: null });
    await assert.rejects(
      () =>
        resolveConversationAttachmentUrl({
          companyId: COMPANY_A,
          conversationId: CONV_A,
          storagePath: PATH_A,
          ctx: ctxView,
          authz: deps,
        }),
      (err: unknown) => err instanceof PermissionDeniedError,
    );
  });

  it("G. malformed storagePath denied", async () => {
    const { authz: deps } = authz({
      conversation: { id: CONV_A, companyId: COMPANY_A },
    });
    await assert.rejects(
      () =>
        resolveConversationAttachmentUrl({
          companyId: COMPANY_A,
          conversationId: CONV_A,
          storagePath: "bad/path",
          ctx: ctxView,
          authz: deps,
        }),
      (err: unknown) => err instanceof ValidationError,
    );
  });

  it("N. no fabricated super-admin bypass of path ownership", async () => {
    const ctx = createContext({
      companyId: COMPANY_A,
      isSuperAdmin: true,
      hasPermission: () => true,
    });
    const { authz: deps } = authz({
      conversation: { id: CONV_A, companyId: COMPANY_A },
    });
    await assert.rejects(
      () =>
        resolveConversationAttachmentUrl({
          companyId: COMPANY_A,
          conversationId: CONV_A,
          storagePath: PATH_CROSS,
          ctx,
          authz: deps,
        }),
      (err: unknown) => err instanceof PermissionDeniedError,
    );
  });
});

describe("H3 conversation-attachment-url — outbound resolve", () => {
  const ctxView = createContext({
    companyId: COMPANY_A,
    hasPermission: (code) =>
      code === CONVERSATION_ATTACHMENT_VIEW_PERMISSION || code === "channel.platform.dispatch",
  });

  it("H. external URL passed through unchanged", async () => {
    const { authz: deps, getSignCount } = authz({
      conversation: { id: CONV_A, companyId: COMPANY_A },
    });
    const external: ChannelAttachmentDto = {
      attachmentId: "ext-1",
      type: "image",
      url: "https://cdn.meta.example/photo.jpg",
    };
    const [resolved] = await resolveOutboundAttachments({
      companyId: COMPANY_A,
      conversationId: CONV_A,
      attachments: [external],
      ctx: ctxView,
      authz: deps,
    });
    assert.equal(resolved?.url, "https://cdn.meta.example/photo.jpg");
    assert.equal(getSignCount(), 0);
  });

  it("I. WhatsApp media ID (no storagePath) passed through unchanged", async () => {
    const { authz: deps, getSignCount } = authz({
      conversation: { id: CONV_A, companyId: COMPANY_A },
    });
    const wa: ChannelAttachmentDto = {
      attachmentId: "media-123",
      type: "image",
      metadata: { whatsappMediaId: "media-123" },
    };
    const [resolved] = await resolveOutboundAttachments({
      companyId: COMPANY_A,
      conversationId: CONV_A,
      attachments: [wa],
      ctx: ctxView,
      authz: deps,
    });
    assert.equal(resolved?.url, undefined);
    assert.equal(resolved?.metadata?.whatsappMediaId, "media-123");
    assert.equal(getSignCount(), 0);
  });

  it("M. repeated dispatch remints fresh URL from storagePath", async () => {
    const { authz: deps, getSignCount } = authz({
      conversation: { id: CONV_A, companyId: COMPANY_A },
      signedUrls: ["https://signed.example/1", "https://signed.example/2"],
    });
    const attachment: ChannelAttachmentDto = {
      attachmentId: "att-1",
      type: "document",
      metadata: { storagePath: PATH_A },
    };
    const first = await resolveOutboundAttachments({
      companyId: COMPANY_A,
      conversationId: CONV_A,
      attachments: [attachment],
      ctx: ctxView,
      authz: deps,
    });
    const second = await resolveOutboundAttachments({
      companyId: COMPANY_A,
      conversationId: CONV_A,
      attachments: [attachment],
      ctx: ctxView,
      authz: deps,
    });
    assert.equal(first[0]?.url, "https://signed.example/1");
    assert.equal(second[0]?.url, "https://signed.example/2");
    assert.equal(getSignCount(), 2);
  });
});

describe("H3 OutboundMessagePipeline — resolve before formatOutbound", () => {
  it("K/L. resolves internal attachment before adapter; adapter stays Storage-unaware", async () => {
    const companyChannel: ResolvedCompanyChannel = {
      id: "company-channel-1",
      companyId: COMPANY_A,
      channelKey: "web_chat",
      displayName: "Web Chat",
      isEnabled: true,
      provider: "stub",
      configuration: {},
    };

    let formattedAttachments: ChannelAttachmentDto[] | undefined;
    const adapter = createStubWebChatAdapter();
    const originalFormat = adapter.formatOutbound.bind(adapter);
    adapter.formatOutbound = (ctx, message) => {
      formattedAttachments = message.attachments;
      return originalFormat(ctx, message);
    };

    const deliveryEvents: ChannelDeliveryEventRecord[] = [];
    const deliveryRepository: ChannelDeliveryEventRepository = {
      createEvent: async (input: CreateDeliveryEventInput) => {
        const record: ChannelDeliveryEventRecord = {
          id: "delivery-1",
          company_id: input.companyId,
          company_channel_id: input.companyChannelId,
          channel_key: input.channelKey,
          conversation_id: input.conversationId,
          channel_session_id: input.channelSessionId ?? null,
          outbound_message_id: input.outboundMessageId ?? null,
          external_thread_id: input.externalThreadId,
          external_message_id: null,
          delivery_status: "pending",
          attempt_count: 0,
          payload: input.payload ?? {},
          provider_response: {},
          error_message: null,
          sent_at: null,
          delivered_at: null,
          read_at: null,
          failed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        deliveryEvents.push(record);
        return record;
      },
      updateEvent: async (input: UpdateDeliveryEventInput) => {
        const existing = deliveryEvents.find((row) => row.id === input.deliveryEventId)!;
        Object.assign(existing, {
          delivery_status: input.deliveryStatus ?? existing.delivery_status,
          external_message_id: input.externalMessageId ?? existing.external_message_id,
          provider_response: input.providerResponse ?? existing.provider_response,
          error_message: input.errorMessage ?? existing.error_message,
          sent_at: input.sentAt ?? existing.sent_at,
          failed_at: input.failedAt ?? existing.failed_at,
          attempt_count: input.attemptCount ?? existing.attempt_count,
        });
        return existing;
      },
      findById: async (id) => deliveryEvents.find((row) => row.id === id) ?? null,
      findByExternalMessageId: async () => null,
    };

    const sessions: ChannelSessionRecord[] = [
      {
        id: "session-1",
        company_id: COMPANY_A,
        company_channel_id: companyChannel.id,
        conversation_id: CONV_A,
        channel_key: "web_chat",
        external_thread_id: "thread-1",
        sender_external_id: null,
        session_status: "active",
        metadata: {},
        last_inbound_at: null,
        last_outbound_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const sessionRepository: ChannelSessionRepository = {
      findByExternalThread: async () => sessions[0] ?? null,
      createSession: async () => sessions[0]!,
      reattachConversation: async () => sessions[0]!,
      updateSessionMetadata: async () => sessions[0]!,
      touchInbound: async () => sessions[0]!,
      touchOutbound: async () => {
        sessions[0]!.last_outbound_at = new Date().toISOString();
        return sessions[0]!;
      },
    };

    const { authz: deps } = authz({
      conversation: { id: CONV_A, companyId: COMPANY_A },
      signedUrls: ["https://signed.example/outbound"],
    });

    const pipeline = new OutboundMessagePipeline(
      {
        registry: {
          getCompanyChannel: async () => companyChannel,
        } as never,
        conversation: {
          addOutgoingMessage: async () => ({
            id: "msg-1",
            conversationId: CONV_A,
            messageType: "outgoing",
            content: "hi",
            createdAt: new Date().toISOString(),
          }),
        } as never,
        runtime: {} as never,
        conversationAttachmentUrl: createConversationAttachmentUrlPort(deps),
      },
      createChannelAdapterRegistry([adapter]),
      new DeliveryTrackingEngine(deliveryRepository),
      sessionRepository,
    );

    const ctx = createContext({
      companyId: COMPANY_A,
      hasPermission: (code) =>
        [
          "channel.platform.dispatch",
          "channel.platform.view",
          CONVERSATION_ATTACHMENT_VIEW_PERMISSION,
        ].includes(code),
    });

    await pipeline.process(ctx, {
      companyId: COMPANY_A,
      companyChannelId: companyChannel.id,
      channelKey: "web_chat",
      conversationId: CONV_A,
      channelSessionId: "session-1",
      externalThreadId: "thread-1",
      text: "see file",
      attachments: [
        {
          attachmentId: "att-1",
          type: "document",
          metadata: { storagePath: PATH_A },
        },
      ],
      persistConversationMessage: false,
    });

    assert.equal(formattedAttachments?.[0]?.url, "https://signed.example/outbound");
    assert.equal(
      (deliveryEvents[0]?.payload as { attachments?: ChannelAttachmentDto[] })?.attachments?.[0]?.url,
      undefined,
    );

    const whatsappAdapterSrc = readFileSync(
      resolve(__dirname, "../adapters/whatsapp/whatsapp-cloud-adapter.ts"),
      "utf8",
    );
    assert.doesNotMatch(whatsappAdapterSrc, /createSignedUrl|conversation-attachments|storagePath/);
  });
});
