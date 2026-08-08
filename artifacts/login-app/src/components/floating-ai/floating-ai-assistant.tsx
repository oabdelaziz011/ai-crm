import { lazy, Suspense, useEffect } from "react";
import { useHasPermission } from "@/hooks/use-rbac";
import { useAiPanel } from "@/hooks/floating-ai/use-ai-panel";
import { useAiTasks } from "@/context/ai-task-context";
import { useFloatingAi } from "@/context/floating-ai-context";

const FloatingAiPanel = lazy(() =>
  import("./floating-ai-panel").then((m) => ({ default: m.FloatingAiPanel })),
);

function FloatingAiAssistantInner() {
  const canViewAi = useHasPermission("ai_chat.view");
  const { isPanelVisible, minimized } = useAiPanel();
  const { onTaskComplete, activeTaskCount } = useAiTasks();
  const { incrementNotifications } = useFloatingAi();

  useEffect(() => {
    return onTaskComplete(() => {
      incrementNotifications();
    });
  }, [onTaskComplete, incrementNotifications]);

  if (!canViewAi) return null;

  return (
    <>
      {isPanelVisible && (
        <Suspense fallback={null}>
          <FloatingAiPanel />
        </Suspense>
      )}
      {activeTaskCount > 0 && minimized && (
        <span className="sr-only" role="status" aria-live="polite">
          {activeTaskCount} background tasks running
        </span>
      )}
    </>
  );
}

/** Preload panel chunk after login for instant open */
export function preloadFloatingAiAssistant() {
  void import("./floating-ai-panel");
}

export function FloatingAiAssistant() {
  return <FloatingAiAssistantInner />;
}
