import type { TimelineEvent } from "@workspace/activity-timeline";
import type { SimulationSnapshot } from "../../simulation/types/simulation-types";
import { mapSimulationTimelineToActivityEvents } from "../../simulation/selectors/simulation-timeline-selectors";

export function mapReplayHistoryToActivityEvents(input: {
  snapshots: ReadonlyArray<Readonly<SimulationSnapshot>>;
  companyId: string;
  flowId: string;
  selectedFrameIndex?: number | null;
}): TimelineEvent[] {
  return input.snapshots.flatMap((snapshot, frameIndex) =>
    mapSimulationTimelineToActivityEvents({
      entries: snapshot.timeline,
      companyId: input.companyId,
      flowId: input.flowId,
    }).map((event) => ({
      ...event,
      metadata: {
        ...event.metadata,
        debugger: true,
        replayFrameIndex: frameIndex,
        replaySelected: input.selectedFrameIndex === frameIndex,
      },
    })),
  );
}

export function mapSelectedSnapshotToActivityEvents(input: {
  snapshot: Readonly<SimulationSnapshot>;
  companyId: string;
  flowId: string;
  frameIndex?: number | null;
}): TimelineEvent[] {
  return mapSimulationTimelineToActivityEvents({
    entries: input.snapshot.timeline,
    companyId: input.companyId,
    flowId: input.flowId,
  }).map((event) => ({
    ...event,
    metadata: {
      ...event.metadata,
      debugger: true,
      replayFrameIndex: input.frameIndex ?? null,
    },
  }));
}
