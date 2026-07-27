import { useCallback, useMemo, useState } from "react";
import { useAiChatWorkspace } from "@/hooks/ai-chat/use-ai-chat-workspace";
import { useFloatingAi } from "@/context/floating-ai-context";
import { useAiTasks } from "@/context/ai-task-context";
import { buildRuntimePageContext } from "@/lib/floating-ai/global-context";
import {
  buildConfirmationPrompt,
  createPendingConfirmation,
  isDestructiveAction,
  type PendingConfirmation,
} from "@/lib/floating-ai/action-confirmation";
import { parseSlashCommand } from "@/lib/floating-ai/slash-commands";

export function useFloatingAiChat() {
  const { pageContext, incrementNotifications } = useFloatingAi();
  const { startTask, updateTaskProgress, completeTask, failTask } = useAiTasks();
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const getPageContext = useCallback(() => {
    return buildRuntimePageContext(pageContext) as unknown as Record<string, unknown>;
  }, [pageContext]);

  const workspace = useAiChatWorkspace({
    source: "floating",
    getPageContext,
  });

  const resolveInput = useCallback((text: string): { prompt: string; needsConfirmation: boolean; confirmation: PendingConfirmation | null } => {
    const slash = parseSlashCommand(text);
    let base = text;

    if (slash) {
      base = slash.remainder
        ? `${slash.command.prompt}\n\nAdditional context: ${slash.remainder}`
        : slash.command.prompt;
    }

    if (slash?.command.destructive || isDestructiveAction(base)) {
      const confirmation = createPendingConfirmation(text, base);
      return {
        prompt: buildConfirmationPrompt(base),
        needsConfirmation: true,
        confirmation,
      };
    }

    return { prompt: base, needsConfirmation: false, confirmation: null };
  }, []);

  const sendMessage = useCallback(
    async (text: string, skipConfirmation = false) => {
      const { prompt, needsConfirmation, confirmation } = skipConfirmation
        ? { prompt: text, needsConfirmation: false, confirmation: null }
        : resolveInput(text);

      if (needsConfirmation && confirmation) {
        setPendingConfirmation(confirmation);
        return { needsConfirmation: true as const };
      }

      setPendingConfirmation(null);
      const taskId = startTask(
        text.startsWith("/") ? text.split("\n")[0] : "AI request",
        { background: true },
      );

      try {
        updateTaskProgress(taskId, 10, "Sending…");
        await workspace.sendMessage(prompt);
        updateTaskProgress(taskId, 100);
        completeTask(taskId);
        return { needsConfirmation: false as const };
      } catch {
        failTask(taskId, "Request failed");
        return { needsConfirmation: false as const };
      }
    },
    [resolveInput, workspace, startTask, updateTaskProgress, completeTask, failTask],
  );

  const confirmPendingAction = useCallback(async () => {
    if (!pendingConfirmation) return;
    const original = pendingConfirmation.resolvedPrompt;
    setPendingConfirmation(null);
    await sendMessage(original, true);
  }, [pendingConfirmation, sendMessage]);

  const cancelPendingAction = useCallback(() => {
    setPendingConfirmation(null);
  }, []);

  const runtimeMetadata = useMemo(
    () => buildRuntimePageContext(pageContext),
    [pageContext],
  );

  return {
    ...workspace,
    sendMessage,
    confirmPendingAction,
    cancelPendingAction,
    pageContext,
    runtimeMetadata,
    pendingConfirmation,
    incrementNotifications,
  };
}
