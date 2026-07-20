import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useAiAssistantSettings } from "@/hooks/use-ai-assistant-settings";
import { useChannelPlatformServices } from "@/lib/channel-platform";
import { useConversationServices } from "@/lib/ai-conversation";
import { useRuntimeChatConfig } from "./use-runtime-chat-config";
import { useWebChatCompanyChannel } from "./use-web-chat-company-channel";

const CONVERSATION_STORAGE_PREFIX = "vault-ai-chat-conversation";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  pending?: boolean;
  streaming?: boolean;
};

function conversationStorageKey(companyId: string) {
  return `${CONVERSATION_STORAGE_PREFIX}:${companyId}`;
}

function mapMessageRecord(message: {
  id: string;
  message_type: string;
  content: string;
  created_at: string;
}): ChatMessage {
  const role =
    message.message_type === "incoming"
      ? "user"
      : message.message_type === "outgoing"
        ? "assistant"
        : "system";

  return {
    id: message.id,
    role,
    content: message.content,
    createdAt: message.created_at,
  };
}

export function aiChatMessagesQueryKey(conversationId: string | null) {
  return ["ai-chat-messages", conversationId] as const;
}

export function useAiChatWorkspace() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const queryClient = useQueryClient();
  const { services: channelPlatformServices, context: channelPlatformContext } = useChannelPlatformServices();
  const { services: conversationServices, context: conversationContext } = useConversationServices();
  const { data: assistantSettings, isLoading: settingsLoading } = useAiAssistantSettings(companyId);
  const { data: runtimeConfig, isLoading: configLoading } = useRuntimeChatConfig(
    companyId,
    Boolean(assistantSettings?.knowledge_enabled),
    assistantSettings?.provider,
  );
  const { data: webChatChannel, isLoading: webChatChannelLoading } = useWebChatCompanyChannel(companyId);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const streamingRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  const assistantName = assistantSettings?.assistant_name?.trim() || "Vault AI";
  const welcomeMessage = assistantSettings?.welcome_message?.trim() || "";

  useEffect(() => {
    if (!companyId || !assistantSettings?.id) return;

    let cancelled = false;

    async function ensureConversation() {
      setConversationError(null);

      const storedId = sessionStorage.getItem(conversationStorageKey(companyId!));

      if (storedId) {
        try {
          await conversationServices.conversations.getConversation(conversationContext, storedId);
          if (!cancelled) setConversationId(storedId);
          return;
        } catch {
          sessionStorage.removeItem(conversationStorageKey(companyId!));
        }
      }

      try {
        const created = await conversationServices.conversations.createConversation(conversationContext, {
          companyId: companyId!,
          aiAssistantId: assistantSettings!.id,
          channelType: "web_chat",
          companyChannelId: webChatChannel?.id,
          metadata: { source: "ai_chat_workspace" },
        });
        sessionStorage.setItem(conversationStorageKey(companyId!), created.id);
        if (!cancelled) setConversationId(created.id);
      } catch (error) {
        if (!cancelled) {
          setConversationError(error instanceof Error ? error.message : "Failed to start conversation.");
        }
      }
    }

    void ensureConversation();

    return () => {
      cancelled = true;
    };
  }, [
    assistantSettings?.id,
    companyId,
    conversationContext,
    conversationServices.conversations,
    webChatChannel?.id,
  ]);

  const messagesQuery = useQuery({
    queryKey: aiChatMessagesQueryKey(conversationId),
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const records = await conversationServices.messages.listMessages(conversationContext, {
        conversationId: conversationId!,
        limit: 100,
      });
      return records.map(mapMessageRecord);
    },
  });

  const displayMessages = useMemo(() => {
    const loaded = messagesQuery.data ?? [];
    if (loaded.length > 0) return loaded;
    if (welcomeMessage) {
      return [
        {
          id: "welcome",
          role: "assistant" as const,
          content: welcomeMessage,
          createdAt: new Date().toISOString(),
        },
      ];
    }
    return [];
  }, [messagesQuery.data, welcomeMessage]);

  const refreshMessages = useCallback(async () => {
    if (!conversationId) return;
    await queryClient.invalidateQueries({ queryKey: aiChatMessagesQueryKey(conversationId) });
  }, [conversationId, queryClient]);

  const startNewConversation = useCallback(async () => {
    if (!companyId || !assistantSettings?.id) return;

    setSendError(null);
    setConversationError(null);
    abortRef.current?.abort();

    const created = await conversationServices.conversations.createConversation(conversationContext, {
      companyId,
      aiAssistantId: assistantSettings.id,
      channelType: "web_chat",
      companyChannelId: webChatChannel?.id,
      metadata: { source: "ai_chat_workspace", restarted: true },
    });

    sessionStorage.setItem(conversationStorageKey(companyId), created.id);
    setConversationId(created.id);
    setStreamingContent("");
    streamingRef.current = "";
    await queryClient.invalidateQueries({ queryKey: aiChatMessagesQueryKey(created.id) });
  }, [
    assistantSettings?.id,
    companyId,
    conversationContext,
    conversationServices.conversations,
    queryClient,
    webChatChannel?.id,
  ]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !companyId || !conversationId || isSending) return;

      if (!webChatChannel?.id) {
        setSendError("web_chat_channel_missing");
        return;
      }

      if (!runtimeConfig?.ready || !runtimeConfig.providerConnectionId) {
        setSendError("runtime_config_missing");
        return;
      }

      setSendError(null);
      setIsSending(true);
      setStreamingContent("");
      streamingRef.current = "";

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await channelPlatformServices.router.routeInbound(channelPlatformContext, {
          companyId,
          companyChannelId: webChatChannel.id,
          channelKey: "web_chat",
          source: "direct",
          externalThreadId: conversationId,
          conversationId,
          aiAssistantId: assistantSettings?.id,
          payload: { text: trimmed, externalThreadId: conversationId },
          executeAi: true,
          runtimeConfig: {
            providerConnectionId: runtimeConfig.providerConnectionId,
            knowledgeRetrieval:
              runtimeConfig.knowledgeRetrieval?.embeddingConnectionId &&
              runtimeConfig.knowledgeRetrieval?.vectorStoreConnectionId &&
              runtimeConfig.knowledgeRetrieval?.collectionId
                ? {
                    embeddingConnectionId: runtimeConfig.knowledgeRetrieval.embeddingConnectionId,
                    vectorStoreConnectionId: runtimeConfig.knowledgeRetrieval.vectorStoreConnectionId,
                    collectionId: runtimeConfig.knowledgeRetrieval.collectionId,
                  }
                : undefined,
            executionPolicy: { streaming: true },
          },
          onStreamChunk: (chunk) => {
            streamingRef.current += chunk;
            setStreamingContent(streamingRef.current);
          },
          abortSignal: controller.signal,
        });

        await refreshMessages();
      } catch (error) {
        if (controller.signal.aborted) return;
        setSendError(error instanceof Error ? error.message : "channel_route_failed");
      } finally {
        setIsSending(false);
        setStreamingContent("");
        streamingRef.current = "";
        abortRef.current = null;
      }
    },
    [
      assistantSettings?.id,
      channelPlatformContext,
      channelPlatformServices.router,
      companyId,
      conversationId,
      isSending,
      refreshMessages,
      runtimeConfig,
      webChatChannel?.id,
    ],
  );

  const isLoading =
    settingsLoading || configLoading || webChatChannelLoading || !conversationId || messagesQuery.isLoading;

  return {
    assistantName,
    companyId,
    conversationId,
    conversationError,
    displayMessages,
    isLoading,
    isSending,
    runtimeConfig,
    sendError,
    sendMessage,
    startNewConversation,
    streamingContent,
    webChatChannel,
  };
}
