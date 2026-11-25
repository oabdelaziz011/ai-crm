import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAiChatWorkspace } from "@/hooks/ai-chat/use-ai-chat-workspace";
import { useFloatingAiRuntimeOverride } from "@/hooks/floating-ai/floating-ai-runtime-override";
import { useAuthActions, useUser } from "@/context/auth-context";
import { useFloatingAi } from "@/context/floating-ai-context";
import { useAiTasks } from "@/context/ai-task-context";
import { useAuthUser, usePermissions } from "@/hooks/use-rbac";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import { usePlatformFeatureEnabledLookup } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { buildRuntimePageContext } from "@/lib/floating-ai/global-context";
import {
  buildConfirmationPrompt,
  createPendingConfirmation,
  isDestructiveAction,
  type PendingConfirmation,
} from "@/lib/floating-ai/action-confirmation";
import { parseSlashCommand } from "@/lib/floating-ai/slash-commands";
import {
  enrichGuidePageContext,
  type GuideLanguage,
} from "@/lib/floating-ai/guide/guide-prompt";
import type { GuideEffectiveAuth } from "@/lib/floating-ai/guide/guide-auth";

function resolveGuideLanguage(lng: string | undefined): GuideLanguage {
  const base = (lng ?? "en").split("-")[0]?.toLowerCase();
  if (base === "ar" || base === "de") return base;
  return "en";
}

export function useFloatingAiChat() {
  const runtimeOverride = useFloatingAiRuntimeOverride();
  const { pageContext, incrementNotifications, surface } = useFloatingAi();
  const { startTask, updateTaskProgress, completeTask, failTask } = useAiTasks();
  const { refreshAuthContext } = useAuthActions();
  const { profile, company } = useUser();
  const { permissionCodes, isSuperAdmin, isLoading: authUserLoading } = useAuthUser();
  const { isLoading: permissionsLoading, isRefreshing } = usePermissions();
  const platformFeatureEnabled = usePlatformFeatureEnabledLookup();
  const { lookup: commercialFeatureEnabled } = useCommercialFeatureLookup();
  const { i18n, t } = useTranslation("common");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const buildGuideAuth = useCallback((): GuideEffectiveAuth => {
    return {
      userId: profile?.id ?? null,
      companyId: profile?.company_id ?? company?.id ?? null,
      isSuperAdmin,
      permissionCodes,
      permissionsAvailable: !authUserLoading && !permissionsLoading,
      isRefreshing,
      platformFeatureEnabled,
      commercialFeatureEnabled,
    };
  }, [
    authUserLoading,
    commercialFeatureEnabled,
    company?.id,
    isRefreshing,
    isSuperAdmin,
    permissionCodes,
    permissionsLoading,
    platformFeatureEnabled,
    profile?.company_id,
    profile?.id,
  ]);

  const getPageContext = useCallback(() => {
    const base = buildRuntimePageContext(pageContext) as unknown as Record<string, unknown>;
    if (surface !== "guide") return base;

    const language = resolveGuideLanguage(i18n.language);
    return enrichGuidePageContext({
      base,
      auth: buildGuideAuth(),
      language,
      activeTab:
        typeof pageContext.activeTab === "string" ? pageContext.activeTab : null,
      t: (key) => t(key),
    });
  }, [buildGuideAuth, i18n.language, pageContext, surface, t]);

  const workspace = useAiChatWorkspace({
    source: "floating",
    getPageContext,
    surface,
  });

  const resolveInput = useCallback((text: string): { prompt: string; needsConfirmation: boolean; confirmation: PendingConfirmation | null } => {
    const slash = parseSlashCommand(text);
    let base = text;

    if (slash) {
      base = slash.remainder
        ? `${slash.command.prompt}\n\nAdditional context: ${slash.remainder}`
        : slash.command.prompt;
    }

    // Guide is read-only — never route destructive Assist slash flows.
    if (surface === "guide") {
      return { prompt: base, needsConfirmation: false, confirmation: null };
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
  }, [surface]);

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

      // Guide uses the message-list "Thinking…" state only — never the task banner that
      // steals conversation vertical space with "Guide request / Sending…".
      const trackTask = surface !== "guide";
      const taskId = trackTask
        ? startTask(text.startsWith("/") ? text.split("\n")[0] : "AI request", { background: true })
        : null;

      try {
        if (surface === "guide") {
          // Refresh effective permissions so guidance is not stuck on a stale snapshot.
          await refreshAuthContext();
        }
        if (taskId) updateTaskProgress(taskId, 10, "Sending…");
        await workspace.sendMessage(prompt);
        if (taskId) {
          updateTaskProgress(taskId, 100);
          completeTask(taskId);
        }
        return { needsConfirmation: false as const };
      } catch {
        if (taskId) failTask(taskId, "Request failed");
        return { needsConfirmation: false as const };
      }
    },
    [
      completeTask,
      failTask,
      refreshAuthContext,
      resolveInput,
      startTask,
      surface,
      updateTaskProgress,
      workspace,
    ],
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

  const chat = {
    ...workspace,
    sendMessage,
    confirmPendingAction,
    cancelPendingAction,
    pageContext,
    runtimeMetadata,
    pendingConfirmation,
    incrementNotifications,
    surface,
  };
  if (!runtimeOverride) return chat;
  return { ...chat, ...runtimeOverride, surface };
}
