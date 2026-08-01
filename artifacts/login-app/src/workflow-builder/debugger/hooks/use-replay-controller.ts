import { useMemo } from "react";
import { createReplayController, type ReplayActionDeps } from "../controllers/replay-actions";
import type { ReplayController } from "../controllers/replay-controller-types";
import { useDebuggerController } from "../context/debug-context";
import { buildDebuggerPanelViewModel, type DebuggerPanelViewModel } from "../selectors/debugger-ui-selectors";

export function useReplayController(): ReplayController {
  const controller = useDebuggerController();

  return useMemo(() => {
    const deps: ReplayActionDeps = {
      stepFirst: controller.stepFirst,
      stepBack: controller.stepBack,
      stepForward: controller.stepForward,
      stepLast: controller.stepLast,
      followLive: controller.followLive,
      resetReplay: controller.resetReplay,
      jumpTo: controller.jumpTo,
      selectFrame: controller.selectFrame,
      selectTimelineEvent: controller.selectTimelineEvent,
      selectNode: controller.selectNode,
      selectVariable: controller.selectVariable,
      getFrames: () => controller.viewModel.frames,
      getFrameSnapshots: () => controller.viewModel.frameSnapshots,
      getReplayIndex: controller.readReplayIndex,
    };

    return createReplayController({
      deps,
      replay: controller.viewModel.replay,
      frameCount: controller.viewModel.frames.length,
    });
  }, [
    controller.followLive,
    controller.jumpTo,
    controller.readReplayIndex,
    controller.resetReplay,
    controller.selectFrame,
    controller.selectNode,
    controller.selectTimelineEvent,
    controller.selectVariable,
    controller.stepBack,
    controller.stepFirst,
    controller.stepForward,
    controller.stepLast,
    controller.viewModel.frameSnapshots,
    controller.viewModel.frames,
    controller.viewModel.replay,
  ]);
}

export function useDebuggerPanelViewModel(): DebuggerPanelViewModel {
  const controller = useDebuggerController();

  return useMemo(
    () =>
      buildDebuggerPanelViewModel({
        displayedSnapshot: controller.viewModel.displayedSnapshot,
        inspector: controller.viewModel.inspector,
        selection: controller.selection,
        replay: controller.viewModel.replay,
        frames: controller.viewModel.frames,
      }),
    [controller.selection, controller.viewModel],
  );
}
