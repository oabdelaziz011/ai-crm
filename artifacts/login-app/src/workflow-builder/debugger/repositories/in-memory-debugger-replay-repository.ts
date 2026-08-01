import { buildSimulationScopeKey } from "../../simulation/cache/simulation-scope-key";
import { DEFAULT_SNAPSHOT_HISTORY_CAPACITY } from "../types/debugger-types";
import type { DebugFrame } from "../types/debugger-types";
import { freezeDebugFrame } from "../utilities/debug-frame-utils";
import { ImmutableHistoryBuffer } from "../utilities/immutable-history-buffer";
import type { DebuggerReplayRepository } from "./debugger-replay-repository";

export class InMemoryDebuggerReplayRepository implements DebuggerReplayRepository {
  private readonly buffers = new Map<string, ImmutableHistoryBuffer<DebugFrame>>();

  private scopeKey(companyId: string, flowId: string): string {
    return buildSimulationScopeKey(companyId, flowId);
  }

  private getBuffer(companyId: string, flowId: string, capacity = DEFAULT_SNAPSHOT_HISTORY_CAPACITY) {
    const key = this.scopeKey(companyId, flowId);
    let buffer = this.buffers.get(key);
    if (!buffer) {
      buffer = new ImmutableHistoryBuffer<DebugFrame>(capacity, freezeDebugFrame);
      this.buffers.set(key, buffer);
    }
    return buffer;
  }

  append(companyId: string, flowId: string, frame: Readonly<DebugFrame>): number {
    return this.getBuffer(companyId, flowId).append(frame);
  }

  previous(companyId: string, flowId: string): boolean {
    return this.getBuffer(companyId, flowId).previous();
  }

  next(companyId: string, flowId: string): boolean {
    return this.getBuffer(companyId, flowId).next();
  }

  jump(companyId: string, flowId: string, index: number): boolean {
    return this.getBuffer(companyId, flowId).jump(index);
  }

  reset(companyId: string, flowId: string): void {
    this.getBuffer(companyId, flowId).reset();
  }

  current(companyId: string, flowId: string): Readonly<DebugFrame> | null {
    return this.getBuffer(companyId, flowId).current();
  }

  list(companyId: string, flowId: string): ReadonlyArray<Readonly<DebugFrame>> {
    return this.getBuffer(companyId, flowId).list();
  }

  getState(companyId: string, flowId: string) {
    return this.getBuffer(companyId, flowId).getState();
  }

  disposeScope(companyId: string, flowId: string): void {
    this.buffers.delete(this.scopeKey(companyId, flowId));
  }
}
