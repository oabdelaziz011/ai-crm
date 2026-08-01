import { buildSimulationScopeKey } from "../cache/simulation-scope-key";
import type { SimulationInternalSession } from "../types/simulation-session-types";
import type { SimulationSnapshot } from "../types/simulation-types";
import { createIdleSimulationSnapshot, freezeSimulationSnapshot } from "../utilities/simulation-snapshot-utils";

export class SimulationSessionRepository {
  private sessions = new Map<string, SimulationInternalSession>();
  private snapshots = new Map<string, Readonly<SimulationSnapshot>>();
  private pendingBreakpoints = new Map<string, string[]>();

  private scopeKey(companyId: string, flowId: string): string {
    return buildSimulationScopeKey(companyId, flowId);
  }

  getSession(companyId: string, flowId: string): SimulationInternalSession | null {
    return this.sessions.get(this.scopeKey(companyId, flowId)) ?? null;
  }

  setSession(companyId: string, flowId: string, session: SimulationInternalSession | null): void {
    const key = this.scopeKey(companyId, flowId);
    if (!session) {
      this.sessions.delete(key);
      return;
    }
    this.sessions.set(key, session);
  }

  getSnapshot(companyId: string, flowId: string): Readonly<SimulationSnapshot> {
    return this.snapshots.get(this.scopeKey(companyId, flowId)) ?? createIdleSimulationSnapshot(companyId, flowId);
  }

  saveSnapshot(companyId: string, flowId: string, snapshot: SimulationSnapshot): Readonly<SimulationSnapshot> {
    const frozen = freezeSimulationSnapshot({ ...snapshot, companyId, flowId });
    this.snapshots.set(this.scopeKey(companyId, flowId), frozen);
    return frozen;
  }

  disposeScope(companyId: string, flowId: string): void {
    const key = this.scopeKey(companyId, flowId);
    this.sessions.delete(key);
    this.snapshots.delete(key);
    this.pendingBreakpoints.delete(key);
  }

  getPendingBreakpoints(companyId: string, flowId: string): string[] {
    return [...(this.pendingBreakpoints.get(this.scopeKey(companyId, flowId)) ?? [])];
  }

  togglePendingBreakpoint(companyId: string, flowId: string, nodeId: string): string[] {
    const current = this.getPendingBreakpoints(companyId, flowId);
    const next = current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId];
    this.pendingBreakpoints.set(this.scopeKey(companyId, flowId), next);
    return next;
  }

  hasScopeData(companyId: string, flowId: string): boolean {
    const key = this.scopeKey(companyId, flowId);
    return this.sessions.has(key) || this.snapshots.has(key) || this.pendingBreakpoints.has(key);
  }
}
