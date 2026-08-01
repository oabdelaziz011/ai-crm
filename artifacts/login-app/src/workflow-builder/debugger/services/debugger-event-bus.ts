import { buildSimulationScopeKey } from "../../simulation/cache/simulation-scope-key";
import type { DebuggerKernelScope } from "../types/debugger-kernel-types";
import type {
  DebuggerEvent,
  DebuggerEventListener,
  DebuggerEventStream,
  DebuggerEventType,
  DebuggerEventPayloadMap,
} from "../types/debugger-event-types";

type ScopeBusState = {
  generation: number;
  sequence: number;
  events: ReadonlyArray<DebuggerEvent>;
  listeners: Set<DebuggerEventListener>;
};

function createScopeBusState(): ScopeBusState {
  return {
    generation: 0,
    sequence: 0,
    events: [],
    listeners: new Set(),
  };
}

let eventCounter = 0;

function createEventId(generation: number, sequence: number): string {
  eventCounter += 1;
  return `dbg-evt-${generation}-${sequence}-${eventCounter}`;
}

export class DebuggerEventBus {
  private readonly scopeStates = new Map<string, ScopeBusState>();

  private scopeKey(scope: DebuggerKernelScope): string {
    return buildSimulationScopeKey(scope.companyId, scope.flowId);
  }

  private getScopeState(scope: DebuggerKernelScope): ScopeBusState {
    const key = this.scopeKey(scope);
    let state = this.scopeStates.get(key);
    if (!state) {
      state = createScopeBusState();
      this.scopeStates.set(key, state);
    }
    return state;
  }

  dispatch<TType extends DebuggerEventType>(
    scope: DebuggerKernelScope,
    type: TType,
    payload: DebuggerEventPayloadMap[TType],
  ): DebuggerEvent {
    const state = this.getScopeState(scope);
    const event = {
      id: createEventId(state.generation, state.sequence),
      type,
      scope: { ...scope },
      sequence: state.sequence,
      generation: state.generation,
      timestamp: new Date().toISOString(),
      payload: structuredClone(payload),
    } as DebuggerEvent;

    Object.freeze(event.payload);
    Object.freeze(event.scope);
    Object.freeze(event);

    state.sequence += 1;
    state.events = Object.freeze([...state.events, event]);

    for (const listener of state.listeners) {
      listener(event);
    }

    return event;
  }

  getStream(scope: DebuggerKernelScope): DebuggerEventStream {
    const state = this.getScopeState(scope);
    return Object.freeze({
      generation: state.generation,
      events: state.events,
    });
  }

  subscribe(scope: DebuggerKernelScope, listener: DebuggerEventListener): () => void {
    const state = this.getScopeState(scope);
    state.listeners.add(listener);
    return () => {
      state.listeners.delete(listener);
    };
  }

  resetScope(scope: DebuggerKernelScope): void {
    const state = this.getScopeState(scope);
    state.generation += 1;
    state.sequence = 0;
    state.events = [];
  }

  disposeScope(scope: DebuggerKernelScope): void {
    this.scopeStates.delete(this.scopeKey(scope));
  }
}
