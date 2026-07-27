import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHasPermission } from "@/hooks/use-rbac";
import { useAgentWorkflow } from "@/hooks/agent-runtime/use-agent-workflow";
import { FLOATING_AI_CAPABILITIES } from "@/lib/floating-ai/types";
import { requiresAgentConfirmation } from "@/lib/floating-ai/agent-goals";
import {
  createPendingConfirmation,
  type PendingConfirmation,
} from "@/lib/floating-ai/action-confirmation";
import { ActionConfirmationDialog } from "./action-confirmation-dialog";
import { AgentEventTimeline } from "./agent-event-timeline";
import { AgentTaskGraphView } from "./agent-task-graph";
import { FloatingAiComposer } from "./floating-ai-composer";

type AgentWorkflowPanelProps = {
  initialGoal?: string;
  onGoalConsumed?: () => void;
};

export const AgentWorkflowPanel = memo(function AgentWorkflowPanel({
  initialGoal,
  onGoalConsumed,
}: AgentWorkflowPanelProps) {
  const { t } = useTranslation("common");
  const canExecuteRuntime = useHasPermission("runtime.execute");
  const {
    workflow,
    taskGraph,
    progress,
    liveEvents,
    isStarting,
    isResuming,
    isLoading,
    isConversationLoading,
    startAgent,
    resumeAgent,
    startError,
    activeWorkflowId,
  } = useAgentWorkflow();

  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const runGoal = useCallback(
    async (goal: string, confirmed = false) => {
      onGoalConsumed?.();
      await startAgent({ goal, confirmed });
    },
    [startAgent, onGoalConsumed],
  );

  const handleStart = useCallback(
    async (text: string) => {
      const goal = text.trim();
      if (!goal || !FLOATING_AI_CAPABILITIES.agentMode) return;

      if (requiresAgentConfirmation(goal)) {
        setPendingConfirmation(createPendingConfirmation(goal, goal));
        return;
      }

      await runGoal(goal);
    },
    [runGoal],
  );

  const handleConfirmStart = useCallback(async () => {
    if (!pendingConfirmation) return;
    const goal = pendingConfirmation.resolvedPrompt;
    setPendingConfirmation(null);
    await runGoal(goal, true);
  }, [pendingConfirmation, runGoal]);

  const handleResume = useCallback(async () => {
    if (!activeWorkflowId) return;
    await resumeAgent(activeWorkflowId);
  }, [activeWorkflowId, resumeAgent]);

  const autoStartedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialGoal || activeWorkflowId || isStarting) return;
    if (autoStartedRef.current === initialGoal) return;
    autoStartedRef.current = initialGoal;
    void handleStart(initialGoal);
  }, [initialGoal, activeWorkflowId, isStarting, handleStart]);

  const disabled = !canExecuteRuntime || isStarting || isResuming || isConversationLoading;
  const status = (workflow?.status as string | undefined) ?? "idle";
  const needsResume = status === "waiting_user" || status === "paused";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold">{t("floatingAi.agent.title")}</p>
              {taskGraph?.agentType === "crm" && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                  {t("floatingAi.agent.crmBadge")}
                </Badge>
              )}
            </div>
            <p className="truncate text-[10px] text-muted-foreground">
              {workflow?.goal ?? t("floatingAi.agent.subtitle")}
            </p>
          </div>
          {needsResume && (
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => void handleResume()} disabled={isResuming}>
              {isResuming ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
              {t("floatingAi.agent.resume")}
            </Button>
          )}
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{t("floatingAi.agent.progress")}</span>
            <span>{progress.toFixed(0)}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
        {status !== "idle" && (
          <p className="text-[10px] capitalize text-muted-foreground">
            {t("floatingAi.agent.status")}: {status.replace("_", " ")}
          </p>
        )}
      </div>

      {(isLoading || isStarting) && !taskGraph ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {isStarting ? t("floatingAi.agent.planning") : t("dashboard.ai.loading")}
        </div>
      ) : (
        <Tabs defaultValue="graph" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-3 mt-2 h-8 shrink-0">
            <TabsTrigger value="graph" className="text-xs">
              {t("floatingAi.agent.tabs.graph")}
            </TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs">
              {t("floatingAi.agent.tabs.timeline")}
            </TabsTrigger>
            <TabsTrigger value="report" className="text-xs">
              {t("floatingAi.agent.tabs.report")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="graph" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
            <AgentTaskGraphView graph={taskGraph} className="max-h-full" />
          </TabsContent>

          <TabsContent value="timeline" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
            <AgentEventTimeline events={liveEvents} className="max-h-full" />
          </TabsContent>

          <TabsContent value="report" className="mt-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden">
            <div className="px-3 py-2">
              {workflow?.final_report ? (
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground">
                  {workflow.final_report}
                </pre>
              ) : workflow?.error_message ? (
                <p className="text-xs text-destructive">{workflow.error_message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("floatingAi.agent.noReport")}</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {startError && (
        <div className="shrink-0 border-t border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {startError}
        </div>
      )}

      <div className="shrink-0 border-t border-border">
        {!activeWorkflowId && (
          <FloatingAiComposer
            disabled={disabled}
            isSending={isStarting}
            onSend={handleStart}
            placeholder={t("floatingAi.agent.goalPlaceholder")}
            sendIcon={Play}
            hideExtras
          />
        )}
        {activeWorkflowId && needsResume && (
          <div className="px-3 py-2 text-[10px] text-amber-600">{t("floatingAi.agent.pausedHint")}</div>
        )}
      </div>
      <ActionConfirmationDialog
        pending={pendingConfirmation}
        onConfirm={() => void handleConfirmStart()}
        onCancel={() => setPendingConfirmation(null)}
      />
    </div>
  );
});
