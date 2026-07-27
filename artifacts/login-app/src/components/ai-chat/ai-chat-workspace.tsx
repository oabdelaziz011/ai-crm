import { useMemo } from "react";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { AiChatComposer } from "@/components/ai-chat/ai-chat-composer";
import { AiChatMessageList } from "@/components/ai-chat/ai-chat-message-list";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { useHasPermission } from "@/hooks/use-rbac";
import { useAiChatWorkspace } from "@/hooks/ai-chat/use-ai-chat-workspace";
import { getDashboardRouteById } from "@/config/dashboard-route-registry";

export function AiChatWorkspace() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const canUseAi = useHasPermission("ai_chat.use");
  const canExecuteRuntime = useHasPermission("runtime.execute");

  const {
    assistantName,
    conversationError,
    displayMessages,
    isLoading,
    isSending,
    runtimeConfig,
    sendError,
    sendMessage,
    startNewConversation,
    streamingContent,
  } = useAiChatWorkspace();

  const configBlocked = !runtimeConfig?.ready;
  const composerDisabled = !canUseAi || !canExecuteRuntime || configBlocked || isLoading;
  const showProviderSetupCta = configBlocked && !isLoading;

  const errorMessage = useMemo(() => {
    if (conversationError === "conversation_start_failed") {
      return t("dashboard.ai.errors.conversationStartFailed");
    }
    if (conversationError) return conversationError;

    if (sendError === "runtime_config_missing") {
      return t("dashboard.ai.errors.runtimeNotConfiguredDetail");
    }
    if (sendError === "web_chat_channel_missing") {
      return t("dashboard.ai.errors.webChatChannelMissing");
    }
    if (sendError === "channel_route_failed") {
      return t("dashboard.ai.errors.channelRouteFailed");
    }
    if (sendError) {
      return t("dashboard.ai.errors.runtimeFailed", { detail: sendError });
    }
    if (showProviderSetupCta) {
      return t("dashboard.ai.errors.runtimeNotConfiguredDetail");
    }
    return null;
  }, [conversationError, sendError, showProviderSetupCta, t]);

  return (
    <div className="space-y-6 flex flex-col min-h-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("dashboard.ai.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.ai.subtitleRuntime")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void startNewConversation()}
          disabled={isLoading || isSending}
          className="border-white/10 bg-transparent hover:bg-white/5"
        >
          <RotateCcw className="w-3.5 h-3.5 me-2" />
          {t("dashboard.ai.newConversation")}
        </Button>
      </div>

      {errorMessage && (
        <DashboardErrorBanner message={errorMessage}>
          {showProviderSetupCta && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 border-white/10"
              onClick={() =>
                setLocation(`${getDashboardRouteById("ai-assistant").nestedPath}#provider-setup`)
              }
            >
              {t("dashboard.ai.openProviderSetup")}
            </Button>
          )}
        </DashboardErrorBanner>
      )}

      <DashboardCard className="flex flex-col overflow-hidden min-h-[440px] max-h-[calc(100vh-14rem)]">
        <div className="p-5 border-b border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">{assistantName}</p>
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              {isSending ? t("dashboard.ai.streaming") : t("dashboard.ai.online")}
            </p>
          </div>
          {isLoading && <Loader2 className="w-4 h-4 ms-auto animate-spin text-muted-foreground" />}
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            {t("dashboard.ai.loading")}
          </div>
        ) : (
          <AiChatMessageList
            messages={displayMessages}
            assistantName={assistantName}
            streamingContent={streamingContent}
            isSending={isSending}
          />
        )}

        <AiChatComposer disabled={composerDisabled} isSending={isSending} onSend={sendMessage} />
      </DashboardCard>

      {!canExecuteRuntime && (
        <p className="text-xs text-muted-foreground">{t("dashboard.ai.errors.missingRuntimePermission")}</p>
      )}
    </div>
  );
}
