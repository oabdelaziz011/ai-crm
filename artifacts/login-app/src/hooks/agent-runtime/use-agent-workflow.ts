import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAgentRuntimeServices } from "@/lib/agent-runtime";
import { useAiTasks } from "@/context/ai-task-context";
import { useFloatingAi } from "@/context/floating-ai-context";
import { buildRuntimePageContext } from "@/lib/floating-ai/global-context";
import { isCrmAgentGoal } from "@/lib/floating-ai/agent-goals";
import { useAiChatWorkspace } from "@/hooks/ai-chat/use-ai-chat-workspace";
import { useAuthUser } from "@/hooks/use-rbac";
import { useAgentsFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { isAgentsAccessible } from "@/lib/platform-ai/agents-access";
import { supabase } from "@/lib/supabase";
import type { AgentTaskGraph, AgentWorkflowEventRecord } from "@workspace/agent-runtime";
import { graphProgress } from "@workspace/agent-runtime";

const AGENT_WORKFLOW_KEY = "agent-workflow-active";

function readStoredWorkflowId(companyId: string): string | null {
  try {
    return sessionStorage.getItem(`${AGENT_WORKFLOW_KEY}:${companyId}`);
  } catch {
    return null;
  }
}

function storeWorkflowId(companyId: string, workflowId: string) {
  try {
    sessionStorage.setItem(`${AGENT_WORKFLOW_KEY}:${companyId}`, workflowId);
  } catch {
    /* ignore */
  }
}

async function persistBackgroundTask(input: {
  companyId: string;
  userId: string | null;
  label: string;
  workflowId: string;
  status: "running" | "completed" | "failed";
  progress: number;
  errorMessage?: string;
}) {
  const { error } = await supabase.from("platform_ai_background_tasks").insert({
    company_id: input.companyId,
    user_id: input.userId,
    label: input.label,
    task_type: "agent_workflow",
    status: input.status,
    progress: input.progress,
    error_message: input.errorMessage ?? null,
    metadata: { workflowId: input.workflowId },
    completed_at: input.status === "completed" || input.status === "failed" ? new Date().toISOString() : null,
  });
  if (error) {
    console.warn("[agent-runtime] background task persist failed", error.message);
  }
}

export function useAgentWorkflow() {
  const { services, context } = useAgentRuntimeServices();
  const { isSuperAdmin, hasPermission } = useAuthUser();
  const { resolvedEnabled: agentsFeatureEnabled } = useAgentsFeatureEnabled();
  const agentsAccessible = isAgentsAccessible({
    isSuperAdmin,
    hasPermission,
    agentsFeatureEnabled,
  });
  const { pageContext, incrementNotifications } = useFloatingAi();
  const { startTask, updateTaskProgress, completeTask, failTask } = useAiTasks();
  const queryClient = useQueryClient();
  const companyId = context.companyId;
  const bgTaskIdRef = useRef<string | null>(null);
  const recoveredWorkflowRef = useRef<string | null>(null);

  const getPageContext = useCallback(
    () => buildRuntimePageContext(pageContext) as unknown as Record<string, unknown>,
    [pageContext],
  );

  const workspace = useAiChatWorkspace({
    source: "floating",
    getPageContext,
  });

  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(() =>
    companyId ? readStoredWorkflowId(companyId) : null,
  );
  const [liveEvents, setLiveEvents] = useState<AgentWorkflowEventRecord[]>([]);

  const workflowQuery = useQuery({
    queryKey: ["agent-workflow", activeWorkflowId],
    enabled: Boolean(activeWorkflowId) && agentsAccessible,
    refetchInterval: (query) => {
      const status = query.state.data?.status as string | undefined;
      if (status === "completed" || status === "failed" || status === "cancelled") return false;
      return 3_000;
    },
    queryFn: async () => {
      if (!activeWorkflowId) return null;
      return services.runtime.getWorkflow(context, activeWorkflowId);
    },
  });

  const startWorkflow = useMutation({
    mutationFn: async (input: string | { goal: string; confirmed?: boolean }) => {
      const goal = typeof input === "string" ? input : input.goal;
      const preStartConfirmationAcknowledged =
        typeof input === "string" ? false : Boolean(input.confirmed);
      if (!companyId) throw new Error("Company required");

      let conversationId = workspace.conversationId;
      if (!conversationId) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        conversationId = workspace.conversationId;
      }
      if (!conversationId) throw new Error("Conversation not ready");

      const bgTaskId = startTask(goal.slice(0, 60), { background: true });
      bgTaskIdRef.current = bgTaskId;
      updateTaskProgress(bgTaskId, 5, "Planning…");

      const result = await services.runtime.start(context, {
        companyId,
        userId: context.userId,
        conversationId,
        goal,
        pageContext: getPageContext(),
        preStartConfirmationAcknowledged,
        agentType: isCrmAgentGoal(goal) ? "crm" : "generic",
      });

      storeWorkflowId(companyId, result.workflowId);
      setActiveWorkflowId(result.workflowId);

      const progress = graphProgress(result.taskGraph);
      updateTaskProgress(bgTaskId, progress, result.status);
      if (result.status === "completed") {
        completeTask(bgTaskId, "Workflow completed");
      } else if (result.status === "failed") {
        failTask(bgTaskId, result.finalReport ?? "Workflow failed");
      } else {
        completeTask(bgTaskId, "Workflow running in background");
      }

      void persistBackgroundTask({
        companyId,
        userId: context.userId,
        label: goal.slice(0, 120),
        workflowId: result.workflowId,
        status: result.status === "completed" ? "completed" : result.status === "failed" ? "failed" : "running",
        progress,
      });

      incrementNotifications();
      return result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent-workflow"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-ai-operations"] });
    },
    onError: (error) => {
      const bgTaskId = bgTaskIdRef.current;
      if (bgTaskId) {
        failTask(bgTaskId, error instanceof Error ? error.message : "Agent workflow failed");
      }
    },
  });

  const recoverWorkflow = useMutation({
    mutationFn: async (workflowId: string) => {
      const result = await services.runtime.recover(context, workflowId);
      void queryClient.invalidateQueries({ queryKey: ["agent-workflow", workflowId] });
      return result;
    },
  });

  const resumeWorkflow = useMutation({
    mutationFn: async (input: string | { workflowId: string; confirmationToken?: string }) => {
      const workflowId = typeof input === "string" ? input : input.workflowId;
      const confirmationToken = typeof input === "string" ? undefined : input.confirmationToken;

      const bgTaskId = startTask("Resume agent workflow", { background: true });
      bgTaskIdRef.current = bgTaskId;
      updateTaskProgress(bgTaskId, 10, "Resuming…");

      const result = await services.runtime.resume(context, {
        workflowId,
        confirmationToken,
      });
      updateTaskProgress(bgTaskId, graphProgress(result.taskGraph));
      if (result.status === "completed") {
        completeTask(bgTaskId);
      } else if (result.status === "failed") {
        failTask(bgTaskId, result.finalReport ?? "Workflow failed");
      } else if (result.status === "waiting_user" && result.confirmationRequest) {
        completeTask(bgTaskId, "Waiting for confirmation");
      } else if (result.status === "waiting_user") {
        failTask(bgTaskId, result.finalReport ?? "Needs attention");
      } else {
        completeTask(bgTaskId);
      }
      return result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent-workflow"] });
    },
  });

  useEffect(() => {
    if (!activeWorkflowId || !workflowQuery.data) return;
    if (workflowQuery.data.status !== "running") return;
    if (recoveredWorkflowRef.current === activeWorkflowId) return;

    recoveredWorkflowRef.current = activeWorkflowId;
    void recoverWorkflow.mutateAsync(activeWorkflowId);
  }, [activeWorkflowId, workflowQuery.data?.status, recoverWorkflow]);

  useEffect(() => {
    if (!activeWorkflowId) return;
    return services.runtime.subscribeEvents((event) => {
      if (event.workflow_id === activeWorkflowId) {
        setLiveEvents((prev) => [...prev.slice(-99), event]);
        void queryClient.invalidateQueries({ queryKey: ["agent-workflow", activeWorkflowId] });
      }
    });
  }, [activeWorkflowId, services.runtime, queryClient]);

  const taskGraph = (workflowQuery.data?.task_graph ?? null) as AgentTaskGraph | null;
  const progress = taskGraph ? graphProgress(taskGraph) : 0;

  return {
    activeWorkflowId,
    workflow: workflowQuery.data,
    taskGraph,
    progress,
    liveEvents,
    isStarting: startWorkflow.isPending,
    isResuming: resumeWorkflow.isPending,
    isLoading: workflowQuery.isLoading,
    startAgent: startWorkflow.mutateAsync,
    resumeAgent: resumeWorkflow.mutateAsync,
    conversationId: workspace.conversationId,
    isConversationLoading: workspace.isLoading,
    startError: startWorkflow.error instanceof Error ? startWorkflow.error.message : null,
  };
}
