import type { DebugFrame } from "../types/debugger-types";
import type { HistoryBufferState } from "../utilities/immutable-history-buffer";

export interface DebuggerReplayRepository {
  append(companyId: string, flowId: string, frame: Readonly<DebugFrame>): number;
  previous(companyId: string, flowId: string): boolean;
  next(companyId: string, flowId: string): boolean;
  jump(companyId: string, flowId: string, index: number): boolean;
  reset(companyId: string, flowId: string): void;
  current(companyId: string, flowId: string): Readonly<DebugFrame> | null;
  list(companyId: string, flowId: string): ReadonlyArray<Readonly<DebugFrame>>;
  getState(companyId: string, flowId: string): HistoryBufferState;
  disposeScope(companyId: string, flowId: string): void;
}
