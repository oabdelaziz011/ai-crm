import { memo, useCallback, useState } from "react";
import {
  Clock3,
  GitBranch,
  Layers3,
  PlayCircle,
  Variable,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import { useDebuggerPanelViewModel, useReplayController } from "../hooks/use-replay-controller";
import { CallStackViewer } from "./call-stack-viewer";
import { DebuggerTimeline } from "./debugger-timeline";
import { ExecutionInspector } from "./execution-inspector";
import { ReplayControls } from "./replay-controls";
import { RuntimeInspector } from "./runtime-inspector";
import { VariableWatch } from "./variable-watch";

type DebuggerTab = "execution" | "variables" | "runtime" | "callstack" | "timeline";

type DebuggerPanelProps = {
  onFocusNode: (nodeId: string) => void;
};

export const DebuggerPanel = memo(function DebuggerPanel({ onFocusNode }: DebuggerPanelProps) {
  const { t } = useTranslation("common");
  const panelModel = useDebuggerPanelViewModel();
  const replayController = useReplayController();
  const [tab, setTab] = useState<DebuggerTab>("execution");

  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      replayController.actions.selectNode(nodeId);
      if (nodeId) onFocusNode(nodeId);
    },
    [onFocusNode, replayController.actions],
  );

  const handleSelectFrame = useCallback(
    (frameId: string) => {
      replayController.actions.selectFrame(frameId);
    },
    [replayController.actions],
  );

  const handleSelectTimelineEvent = useCallback(
    (eventId: string | null) => {
      replayController.actions.selectTimelineEvent(eventId);
    },
    [replayController.actions],
  );

  const handleSelectVariable = useCallback(
    (variableKey: string | null) => {
      replayController.actions.selectVariable(variableKey);
    },
    [replayController.actions],
  );

  return (
    <DashboardCard className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("workflowBuilder.debugger.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("workflowBuilder.debugger.subtitle")}</p>
        </div>
        <Badge variant="outline">{t(`workflowBuilder.simulation.status.${panelModel.workflowStatus}`)}</Badge>
      </div>

      <ReplayControls controls={replayController.controls} actions={replayController.actions} />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("workflowBuilder.debugger.tabs.groupLabel")}>
        <TabButton active={tab === "execution"} icon={PlayCircle} label={t("workflowBuilder.debugger.tabs.execution")} onClick={() => setTab("execution")} />
        <TabButton active={tab === "variables"} icon={Variable} label={t("workflowBuilder.debugger.tabs.variables")} onClick={() => setTab("variables")} />
        <TabButton active={tab === "runtime"} icon={Layers3} label={t("workflowBuilder.debugger.tabs.runtime")} onClick={() => setTab("runtime")} />
        <TabButton active={tab === "callstack"} icon={GitBranch} label={t("workflowBuilder.debugger.tabs.callStack")} onClick={() => setTab("callstack")} />
        <TabButton active={tab === "timeline"} icon={Clock3} label={t("workflowBuilder.debugger.tabs.timeline")} onClick={() => setTab("timeline")} />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/60 p-3">
        {tab === "execution" ? <ExecutionInspector model={panelModel.execution} onSelectNode={handleSelectNode} /> : null}
        {tab === "variables" ? (
          <VariableWatch
            entries={panelModel.variables}
            listWindow={panelModel.variableListWindow}
            rowHeight={panelModel.variableRowHeight}
            selectedVariableKey={panelModel.selectedVariableKey}
            onSelectVariable={handleSelectVariable}
          />
        ) : null}
        {tab === "runtime" ? <RuntimeInspector model={panelModel.runtime} /> : null}
        {tab === "callstack" ? (
          <CallStackViewer
            frames={panelModel.callStack}
            listWindow={panelModel.callStackListWindow}
            rowHeight={panelModel.callStackRowHeight}
            onSelectFrame={handleSelectFrame}
          />
        ) : null}
        {tab === "timeline" ? (
          <DebuggerTimeline timeline={panelModel.timeline} onSelectTimelineEvent={handleSelectTimelineEvent} />
        ) : null}
      </div>
    </DashboardCard>
  );
});

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof PlayCircle;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      className="rounded-xl"
      role="tab"
      aria-selected={active}
      onClick={onClick}
    >
      <Icon className="me-2 h-4 w-4" aria-hidden />
      {label}
    </Button>
  );
}
