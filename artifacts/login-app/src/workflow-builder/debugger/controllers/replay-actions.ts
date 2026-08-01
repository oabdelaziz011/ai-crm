import type { SimulationSnapshot } from "../../simulation/types/simulation-types";
import type { ReplayFrameSummary } from "../types/debugger-types";
import type { ReplayActions, ReplayControlsViewModel } from "./replay-controller-types";
import {
  findTimelineEventById,
  resolveFrameIndexById,
  resolvePrimaryTimelineEventId,
} from "../selectors/debugger-sync-selectors";

export type ReplayActionDeps = {
  stepFirst: () => boolean;
  stepBack: () => boolean;
  stepForward: () => boolean;
  stepLast: () => boolean;
  followLive: () => void;
  resetReplay: () => void;
  jumpTo: (index: number) => boolean;
  selectFrame: (frameId: string | null) => void;
  selectTimelineEvent: (eventId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  selectVariable: (variableKey: string | null) => void;
  getFrames: () => ReadonlyArray<ReplayFrameSummary>;
  getFrameSnapshots: () => ReadonlyArray<Readonly<SimulationSnapshot>>;
  getReplayIndex: () => number;
};

export function buildReplayControlsViewModel(input: {
  replay: ReplayControlsViewModel["replay"];
  frameCount: number;
}): ReplayControlsViewModel {
  return {
    replay: input.replay,
    frameCount: input.frameCount,
    positionLabelKey: "workflowBuilder.debugger.replay.position",
    positionLabelValues:
      input.replay.index >= 0 && input.frameCount > 0
        ? { current: input.replay.index + 1, total: input.frameCount }
        : null,
  };
}

function syncFrameSelection(deps: ReplayActionDeps, index: number): void {
  const frames = deps.getFrames();
  const frame = frames[index];
  const snapshot = deps.getFrameSnapshots()[index];
  if (!frame) return;

  deps.selectFrame(frame.frameId);
  deps.selectTimelineEvent(snapshot ? resolvePrimaryTimelineEventId(snapshot) : null);
  if (snapshot?.currentNodeId) {
    deps.selectNode(snapshot.currentNodeId);
  }
}

export function createReplayActions(deps: ReplayActionDeps): ReplayActions {
  return {
    first: () => {
      const moved = deps.stepFirst();
      if (moved) syncFrameSelection(deps, 0);
      return moved;
    },
    previous: () => {
      const moved = deps.stepBack();
      if (moved) syncFrameSelection(deps, deps.getReplayIndex());
      return moved;
    },
    next: () => {
      const moved = deps.stepForward();
      if (moved) syncFrameSelection(deps, deps.getReplayIndex());
      return moved;
    },
    last: () => {
      const moved = deps.stepLast();
      if (moved) {
        const lastIndex = deps.getFrames().length - 1;
        syncFrameSelection(deps, lastIndex);
      }
      return moved;
    },
    followLive: () => {
      deps.followLive();
      const lastIndex = deps.getFrames().length - 1;
      if (lastIndex >= 0) {
        syncFrameSelection(deps, lastIndex);
      }
    },
    reset: () => {
      deps.resetReplay();
    },
    jumpTo: (index: number) => {
      const moved = deps.jumpTo(index);
      if (moved) syncFrameSelection(deps, index);
      return moved;
    },
    selectFrame: (frameId: string) => {
      const index = resolveFrameIndexById(deps.getFrames(), frameId);
      if (index >= 0) {
        deps.jumpTo(index);
        syncFrameSelection(deps, index);
      }
    },
    selectTimelineEvent: (eventId: string | null) => {
      if (!eventId) {
        deps.selectTimelineEvent(null);
        return;
      }

      const match = findTimelineEventById(deps.getFrameSnapshots(), eventId);
      if (match && match.frameIndex >= 0) {
        deps.jumpTo(match.frameIndex);
        syncFrameSelection(deps, match.frameIndex);
      }

      deps.selectTimelineEvent(eventId);
      if (match?.nodeId) {
        deps.selectNode(match.nodeId);
      }
    },
    selectNode: (nodeId: string | null) => {
      deps.selectNode(nodeId);
    },
    selectVariable: (variableKey: string | null) => {
      deps.selectVariable(variableKey);
    },
  };
}

export function createReplayController(input: {
  deps: ReplayActionDeps;
  replay: ReplayControlsViewModel["replay"];
  frameCount: number;
}) {
  return {
    controls: buildReplayControlsViewModel({ replay: input.replay, frameCount: input.frameCount }),
    actions: createReplayActions(input.deps),
  };
}
