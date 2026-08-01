import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { CallStackFrameViewModel } from "../selectors/debugger-ui-selectors";
import type { DebuggerListWindow } from "../utilities/debugger-list-window";
import { DebuggerVirtualList } from "./debugger-virtual-list";

type CallStackViewerProps = {
  frames: CallStackFrameViewModel[];
  listWindow: DebuggerListWindow;
  rowHeight: number;
  onSelectFrame: (frameId: string) => void;
};

export const CallStackViewer = memo(function CallStackViewer({
  frames,
  listWindow,
  rowHeight,
  onSelectFrame,
}: CallStackViewerProps) {
  const { t } = useTranslation("common");
  const displayFrames = useMemo(() => [...frames].reverse(), [frames]);

  const renderItem = useCallback(
    (frame: CallStackFrameViewModel) => (
      <li key={frame.frameId}>
        <button
          type="button"
          className={`flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
            frame.isSelected || frame.isReplayPosition
              ? "border-primary/40 bg-primary/5"
              : "border-border/50 hover:bg-muted/40"
          }`}
          aria-current={frame.isSelected || frame.isReplayPosition ? "true" : undefined}
          aria-label={frame.currentNodeLabel ?? frame.currentNodeId ?? frame.frameId}
          onClick={() => onSelectFrame(frame.frameId)}
        >
          <div>
            <div className="font-medium">{frame.currentNodeLabel ?? frame.currentNodeId ?? frame.frameId}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("workflowBuilder.debugger.callStack.frameMeta", {
                step: frame.stepNumber,
                depth: frame.executionDepth,
                branch: frame.branchDepth,
              })}
            </div>
            {frame.parentFrameId ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {t("workflowBuilder.debugger.callStack.parent")}: {frame.parentFrameId}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="outline">{frame.status}</Badge>
            {frame.isReplayPosition ? (
              <Badge variant="secondary" className="text-[10px] uppercase">
                {t("workflowBuilder.debugger.callStack.replayPosition")}
              </Badge>
            ) : null}
          </div>
        </button>
      </li>
    ),
    [onSelectFrame, t],
  );

  if (displayFrames.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("workflowBuilder.debugger.empty")}</p>;
  }

  return (
    <DebuggerVirtualList
      items={displayFrames}
      listWindow={listWindow}
      rowHeight={rowHeight}
      renderItem={renderItem}
    />
  );
});
