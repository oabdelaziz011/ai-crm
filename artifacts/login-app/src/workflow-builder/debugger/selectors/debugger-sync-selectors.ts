import type { SimulationSnapshot } from "../../simulation/types/simulation-types";
import type { ReplayFrameSummary } from "../types/debugger-types";

export function resolvePrimaryTimelineEventId(snapshot: Readonly<SimulationSnapshot>): string | null {
  for (let index = snapshot.timeline.length - 1; index >= 0; index -= 1) {
    const entry = snapshot.timeline[index];
    if (entry?.type === "node_entered") {
      return entry.id;
    }
  }
  return snapshot.timeline.at(-1)?.id ?? null;
}

export function findTimelineEventById(
  snapshots: ReadonlyArray<Readonly<SimulationSnapshot>>,
  eventId: string,
): { eventId: string; nodeId: string | null; frameIndex: number } | null {
  for (let frameIndex = snapshots.length - 1; frameIndex >= 0; frameIndex -= 1) {
    const snapshot = snapshots[frameIndex];
    const entry = snapshot?.timeline.find((item) => item.id === eventId);
    if (entry) {
      return { eventId: entry.id, nodeId: entry.nodeId, frameIndex };
    }
  }
  return null;
}

export function resolveFrameIndexForTimelineEvent(
  frames: ReadonlyArray<Pick<ReplayFrameSummary, "frameId">>,
  snapshots: ReadonlyArray<Readonly<SimulationSnapshot>>,
  eventId: string,
): number {
  return findTimelineEventById(snapshots, eventId)?.frameIndex ?? -1;
}

export function resolveFrameIndexById(
  frames: ReadonlyArray<Pick<ReplayFrameSummary, "frameId">>,
  frameId: string,
): number {
  return frames.findIndex((frame) => frame.frameId === frameId);
}
