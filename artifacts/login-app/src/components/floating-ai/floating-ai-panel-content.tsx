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
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/auth-context";
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
  } = useFloatingAiChat();

  const composerDisabled = !canUseAi || !canExecuteRuntime || isLoading;

  const errorMessage = useMemo(() => {
    if (sendError === "runtime_config_missing") return t("dashboard.ai.errors.runtimeNotConfiguredDetail");
    if (sendError === "web_chat_channel_missing") return t("dashboard.ai.errors.webChatChannelMissing");
    if (sendError === "channel_route_failed") return t("dashboard.ai.errors.channelRouteFailed");
    if (sendError) return t("dashboard.ai.errors.runtimeFailed", { detail: sendError });
    return null;
  }, [sendError, t]);

  const routeToAgent = useCallback((goal: string) => {
    if (!showAgentTab) return;
    setPendingAgentGoal(normalizeAgentGoal(goal));
    setPanelTab("agent");
  }, [showAgentTab]);

  const handleSend = useCallback(
    async (text: string) => {
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
    [sendMessage, routeToAgent, showAgentTab],
  );

  const handleQuickAction = useCallback(
    (action: FloatingAiQuickAction) => {
      if (action.navigateTo) {
        setLocation(action.navigateTo);
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
        <header className="relative flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{assistantName}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {company?.name ?? runtimeMetadata.company.name} · {runtimeMetadata.moduleLabel ?? pageContext.page}
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
              <div className="shrink-0 border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {errorMessage}
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

            <QuickActions page={pageContext.page} onAction={handleQuickAction} disabled={composerDisabled || isSending} />
            <FloatingAiComposer disabled={composerDisabled} isSending={isSending} onSend={handleSend} />
          </TabsContent>

          {FLOATING_AI_CAPABILITIES.agentMode && showAgentTab && (
            <TabsContent value="agent" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <AgentWorkflowPanel
                initialGoal={pendingAgentGoal}
                onGoalConsumed={() => setPendingAgentGoal(undefined)}
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
