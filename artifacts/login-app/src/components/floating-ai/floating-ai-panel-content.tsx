import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Bot,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AiChatMessageList } from "@/components/ai-chat/ai-chat-message-list";
import { UserAvatar } from "@/components/profile/user-avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/auth-context";
import { useCompanyIdentity } from "@/hooks/company-workspace/use-company-identity";
import { useAuthUser, useHasPermission } from "@/hooks/use-rbac";
import { useAgentsFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { shouldShowAgentsNavigation } from "@/lib/platform-ai/agents-access";
import { useAiPanel } from "@/hooks/floating-ai/use-ai-panel";
import { useFloatingAiChat } from "@/hooks/floating-ai/use-floating-ai-chat";
import { getDashboardRouteById } from "@/config/dashboard-route-registry";
import type { FloatingAiQuickAction } from "@/lib/floating-ai/types";
import { FLOATING_AI_CAPABILITIES } from "@/lib/floating-ai/types";
import { normalizeAgentGoal, isAgentGoal } from "@/lib/floating-ai/agent-goals";
import { parseSlashCommand } from "@/lib/floating-ai/slash-commands";
import { dashboardNestHref } from "@/lib/routing";
import { ContextBar } from "./context-bar";
import { QuickActions } from "./quick-actions";
import { TaskProgressList } from "./task-progress-list";
import { FloatingAiComposer } from "./floating-ai-composer";
import { ActionConfirmationDialog } from "./action-confirmation-dialog";
import { AgentWorkflowPanel } from "./agent-workflow-panel";
import { AI_PANEL_SIZE_DIMENSIONS } from "@/lib/floating-ai/types";

type FloatingAiPanelContentProps = {
  layout: "floating" | "sheet" | "drawer";
};

export const FloatingAiPanelContent = memo(function FloatingAiPanelContent({
  layout,
}: FloatingAiPanelContentProps) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { company } = useAuth();
  const { identity } = useCompanyIdentity(Boolean(company?.id));
  const { isSuperAdmin, hasPermission } = useAuthUser();
  const canUseAi = useHasPermission("ai_chat.use");
  const canExecuteRuntime = useHasPermission("runtime.execute");
  const { resolvedEnabled: agentsFeatureEnabled } = useAgentsFeatureEnabled();
  const showAgentTab = shouldShowAgentsNavigation({
    isSuperAdmin,
    hasPermission,
    agentsFeatureEnabled,
  });
  const { panelSize, cyclePanelSize, minimizePanel, closePanel } = useAiPanel();
  const [panelTab, setPanelTab] = useState<"chat" | "agent">("chat");
  const [pendingAgentGoal, setPendingAgentGoal] = useState<string | undefined>();

  useEffect(() => {
    if (!showAgentTab && panelTab === "agent") {
      setPanelTab("chat");
    }
  }, [showAgentTab, panelTab]);

  const {
    assistantName,
    pageContext,
    displayMessages,
    isLoading,
    isSending,
    sendError,
    sendMessage,
    confirmPendingAction,
    cancelPendingAction,
    startNewConversation,
    streamingContent,
    runtimeMetadata,
    pendingConfirmation,
    runtimeConfig,
  } = useFloatingAiChat();

  const configBlocked = !runtimeConfig?.ready;
  const composerDisabled = !canUseAi || !canExecuteRuntime || configBlocked || isLoading;
  const showPlatformAdminCta =
    configBlocked &&
    !isLoading &&
    (runtimeConfig?.errorCode === "AI_PROVIDER_NOT_CONFIGURED" ||
      runtimeConfig?.errorCode === "AI_PROVIDER_UNAVAILABLE" ||
      runtimeConfig?.platformProviderReady === false ||
      runtimeConfig?.ready === false);

  const errorMessage = useMemo(() => {
    if (sendError === "runtime_config_missing") {
      if (runtimeConfig?.errorCode === "AI_PROVIDER_UNAVAILABLE") {
        return t("dashboard.ai.errors.providerUnavailable");
      }
      return t("dashboard.ai.errors.providerNotConfigured");
    }
    if (sendError === "web_chat_channel_missing") return t("dashboard.ai.errors.webChatChannelMissing");
    if (sendError === "channel_route_failed") return t("dashboard.ai.errors.channelRouteFailed");
    if (sendError) return t("dashboard.ai.errors.runtimeFailed", { detail: sendError });
    if (showPlatformAdminCta) {
      if (runtimeConfig?.errorCode === "AI_PROVIDER_UNAVAILABLE") {
        return t("dashboard.ai.errors.providerUnavailable");
      }
      return t("dashboard.ai.errors.providerNotConfigured");
    }
    return null;
  }, [sendError, showPlatformAdminCta, runtimeConfig?.errorCode, t]);

  const openPlatformAiSettings = useCallback(() => {
    setLocation(`${getDashboardRouteById("settings").nestedPath}/platform-ai`);
  }, [setLocation]);

  const routeToAgent = useCallback((goal: string) => {
    if (!showAgentTab) return;
    setPendingAgentGoal(normalizeAgentGoal(goal));
    setPanelTab("agent");
  }, [showAgentTab]);

  const handleSend = useCallback(
    async (text: string) => {
      if (configBlocked) {
        if (isSuperAdmin) openPlatformAiSettings();
        return;
      }
      const slash = parseSlashCommand(text);
      if (slash?.command.agentMode && FLOATING_AI_CAPABILITIES.agentMode && showAgentTab) {
        const goal = slash.remainder || "Execute multi-step workflow for current page context";
        routeToAgent(goal);
        return;
      }

      if (FLOATING_AI_CAPABILITIES.agentMode && showAgentTab && isAgentGoal(text)) {
        routeToAgent(text);
        return;
      }

      const result = await sendMessage(text);
      if (result?.needsConfirmation) return;
    },
    [configBlocked, isSuperAdmin, openPlatformAiSettings, sendMessage, routeToAgent, showAgentTab],
  );

  const handleQuickAction = useCallback(
    (action: FloatingAiQuickAction) => {
      if (action.navigateTo) {
        setLocation(dashboardNestHref(action.navigateTo));
        return;
      }
      if (action.prompt) {
        void handleSend(action.prompt);
      }
    },
    [handleSend, setLocation],
  );

  const dimensions =
    panelSize === "fullscreen"
      ? null
      : AI_PANEL_SIZE_DIMENSIONS[panelSize as keyof typeof AI_PANEL_SIZE_DIMENSIONS];

  const panelStyle =
    layout === "floating" && dimensions
      ? { width: dimensions.width, height: dimensions.height }
      : undefined;

  return (
    <>
      <div
        className="flex h-full flex-col overflow-hidden bg-card"
        style={panelStyle}
        role="dialog"
        aria-label={t("floatingAi.panel.label")}
        aria-modal={layout !== "floating"}
      >
        <header className="relative flex h-16 shrink-0 items-center justify-between border-b border-border px-3">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative shrink-0">
              <UserAvatar className="size-9 border border-primary/20" />
              <span className="absolute -bottom-0.5 -end-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="size-2.5" aria-hidden="true" />
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{assistantName}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {identity?.name ?? runtimeMetadata.company.name} · {runtimeMetadata.moduleLabel ?? pageContext.page}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {layout === "floating" && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={cyclePanelSize}
                aria-label={t("floatingAi.panel.resize")}
              >
                {panelSize === "fullscreen" ? (
                  <Minimize2 className="size-3.5" />
                ) : (
                  <Maximize2 className="size-3.5" />
                )}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => void startNewConversation()}
              disabled={isLoading || isSending}
              aria-label={t("dashboard.ai.newConversation")}
            >
              <RotateCcw className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setLocation(getDashboardRouteById("ai-chat").nestedPath)}
              aria-label={t("floatingAi.panel.openWorkspace")}
            >
              <ExternalLink className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={minimizePanel}
              aria-label={t("floatingAi.panel.minimize")}
            >
              <Minus className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={closePanel}
              aria-label={t("floatingAi.panel.close")}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </header>

        <ContextBar pageContext={pageContext} />
        <TaskProgressList />

        <Tabs
          value={panelTab}
          onValueChange={(value) => setPanelTab(value as "chat" | "agent")}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="mx-3 mt-2 h-8 shrink-0 self-start">
            <TabsTrigger value="chat" className="gap-1 text-xs">
              <Sparkles className="size-3" />
              {t("floatingAi.tabs.chat")}
            </TabsTrigger>
            {FLOATING_AI_CAPABILITIES.agentMode && showAgentTab && (
              <TabsTrigger value="agent" className="gap-1 text-xs">
                <Bot className="size-3" />
                {t("floatingAi.tabs.agent")}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="chat" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            {errorMessage && (
              <div className="shrink-0 space-y-2 border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <p>{errorMessage}</p>
                {showPlatformAdminCta ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={isSuperAdmin ? openPlatformAiSettings : undefined}
                  >
                    {isSuperAdmin
                      ? t("dashboard.ai.openPlatformAiSettings")
                      : t("dashboard.ai.errors.contactPlatformAdmin")}
                  </Button>
                ) : null}
              </div>
            )}

            {isLoading ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
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

            <QuickActions
              page={pageContext.page}
              onAction={handleQuickAction}
              disabled={composerDisabled || isSending}
            />
            <FloatingAiComposer disabled={composerDisabled} isSending={isSending} onSend={handleSend} />
          </TabsContent>

          {FLOATING_AI_CAPABILITIES.agentMode && showAgentTab && (
            <TabsContent value="agent" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              {showPlatformAdminCta ? (
                <div className="shrink-0 space-y-2 border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <p>
                    {runtimeConfig?.errorCode === "AI_PROVIDER_UNAVAILABLE"
                      ? t("dashboard.ai.errors.providerUnavailable")
                      : t("dashboard.ai.errors.providerNotConfigured")}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={isSuperAdmin ? openPlatformAiSettings : undefined}
                  >
                    {isSuperAdmin
                      ? t("dashboard.ai.openPlatformAiSettings")
                      : t("dashboard.ai.errors.contactPlatformAdmin")}
                  </Button>
                </div>
              ) : null}
              <AgentWorkflowPanel
                initialGoal={pendingAgentGoal}
                onGoalConsumed={() => setPendingAgentGoal(undefined)}
                runtimeReady={!configBlocked}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <ActionConfirmationDialog
        pending={pendingConfirmation}
        onConfirm={() => void confirmPendingAction()}
        onCancel={cancelPendingAction}
      />
    </>
  );
});
