import { memo } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useFloatingPosition } from "@/hooks/floating-ai/use-floating-position";
import { useAiPanel } from "@/hooks/floating-ai/use-ai-panel";
import { useFloatingAi } from "@/context/floating-ai-context";
import { useAiTasks } from "@/context/ai-task-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

type FloatingAiButtonProps = {
  visible?: boolean;
  onBeforeOpen?: () => void;
};

export const FloatingAiButton = memo(function FloatingAiButton({
  visible = true,
  onBeforeOpen,
}: FloatingAiButtonProps) {
  const { t } = useTranslation("common");
  const { openPanel } = useAiPanel();
  const { notificationCount, incrementNotifications, setPendingFocusOnOpen } = useFloatingAi();
  const { activeTaskCount } = useAiTasks();
  const { position, buttonSize, onPointerDown, onPointerMove, onPointerUp, wasDragged } =
    useFloatingPosition();

  const hasNotifications = notificationCount > 0 || activeTaskCount > 0;

  if (!visible) return null;

  const handleClick = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (wasDragged(event)) {
      event.preventDefault();
      return;
    }
    onBeforeOpen?.();
    setPendingFocusOnOpen(true);
    openPanel();
    if (activeTaskCount > 0) {
      incrementNotifications();
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={handleClick}
            className={cn(
              "fixed z-[90] flex items-center justify-center rounded-full border border-primary/30 bg-gradient-to-br from-primary/90 to-primary shadow-lg shadow-primary/25 transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              hasNotifications && "animate-pulse",
            )}
            style={{
              width: buttonSize,
              height: buttonSize,
              left: position.x,
              top: position.y,
              touchAction: "none",
            }}
            aria-label={t("floatingAi.button.label")}
          >
            <Sparkles className="size-6 text-primary-foreground" aria-hidden="true" />
            {hasNotifications && (
              <span
                className="absolute -end-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white"
                aria-hidden="true"
              >
                {Math.min(9, notificationCount + activeTaskCount)}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          <p>{t("floatingAi.button.tooltip")}</p>
          <p className="text-muted-foreground">{isMac ? "⌘K" : "Ctrl+K"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
