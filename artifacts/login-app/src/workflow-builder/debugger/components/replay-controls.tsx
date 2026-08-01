import { memo, useCallback, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
  SkipBack,
  SkipForward,
  StepForward,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReplayActions, ReplayControlsViewModel } from "../controllers/replay-controller-types";

type ReplayControlsProps = {
  controls: ReplayControlsViewModel;
  actions: ReplayActions;
};

export const ReplayControls = memo(function ReplayControls({ controls, actions }: ReplayControlsProps) {
  const { t } = useTranslation("common");
  const { replay, frameCount } = controls;
  const hasFrames = frameCount > 0;
  const positionLabel =
    controls.positionLabelValues != null
      ? t(controls.positionLabelKey, controls.positionLabelValues)
      : "—";

  const handleJumpKeyDown = useCallback(
    (event: KeyboardEvent<HTMLSelectElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.currentTarget.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    [],
  );

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("workflowBuilder.debugger.replay.groupLabel")}>
      <Badge variant={replay.mode === "live" ? "default" : "secondary"}>
        {replay.mode === "live"
          ? t("workflowBuilder.debugger.replay.live")
          : t("workflowBuilder.debugger.replay.replay")}
      </Badge>
      <span className="text-xs text-muted-foreground" aria-live="polite">
        {positionLabel}
      </span>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          disabled={!hasFrames || !replay.canStepBack}
          aria-label={t("workflowBuilder.debugger.replay.first")}
          onClick={() => actions.first()}
        >
          <ChevronsLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          disabled={!replay.canStepBack}
          aria-label={t("workflowBuilder.debugger.replay.previous")}
          onClick={() => actions.previous()}
        >
          <SkipBack className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          disabled={!replay.canStepForward}
          aria-label={t("workflowBuilder.debugger.replay.next")}
          onClick={() => actions.next()}
        >
          <SkipForward className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          disabled={!hasFrames}
          aria-label={t("workflowBuilder.debugger.replay.last")}
          onClick={() => actions.last()}
        >
          <ChevronsRight className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          disabled={!hasFrames || replay.mode === "live"}
          aria-label={t("workflowBuilder.debugger.replay.followLive")}
          onClick={() => actions.followLive()}
        >
          <StepForward className="me-1 h-4 w-4" aria-hidden />
          {t("workflowBuilder.debugger.replay.followLive")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          disabled={!hasFrames}
          aria-label={t("workflowBuilder.debugger.replay.reset")}
          onClick={() => actions.reset()}
        >
          <RotateCcw className="me-1 h-4 w-4" aria-hidden />
          {t("workflowBuilder.debugger.replay.reset")}
        </Button>
      </div>
      {hasFrames ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("workflowBuilder.debugger.replay.jump")}
          <select
            className="rounded-lg border border-border/60 bg-background px-2 py-1 text-foreground"
            value={Math.max(replay.index, 0)}
            aria-label={t("workflowBuilder.debugger.replay.jumpLabel")}
            onChange={(event) => actions.jumpTo(Number(event.target.value))}
            onKeyDown={handleJumpKeyDown}
          >
            {Array.from({ length: frameCount }, (_, index) => (
              <option key={index} value={index}>
                {t("workflowBuilder.debugger.replay.frameOption", { index: index + 1 })}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
});
