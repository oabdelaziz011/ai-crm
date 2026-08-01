import type { DebuggerReplayState } from "../types/debugger-types";

export type ReplayControlsViewModel = {
  replay: DebuggerReplayState;
  frameCount: number;
  positionLabelKey: "workflowBuilder.debugger.replay.position";
  positionLabelValues: { current: number; total: number } | null;
};

export type ReplayActions = {
  first: () => boolean;
  previous: () => boolean;
  next: () => boolean;
  last: () => boolean;
  followLive: () => void;
  reset: () => void;
  jumpTo: (index: number) => boolean;
  selectFrame: (frameId: string) => void;
  selectTimelineEvent: (eventId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  selectVariable: (variableKey: string | null) => void;
};

export type ReplayController = {
  controls: ReplayControlsViewModel;
  actions: ReplayActions;
};
