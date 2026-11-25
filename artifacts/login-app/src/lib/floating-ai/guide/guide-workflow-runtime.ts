/**
 * Tool-less Guide workflow runtime (NAVIGATE + CONFIRM only).
 *
 * The runtime tracks which step the user is on. It never performs, and never
 * reports, business writes (create / update). A step with `navigateRouteId`
 * only records that navigation was requested; the host UI performs the
 * navigation via `authorizeGuideNavigation` and acknowledges the outcome.
 * Completion means "the user told Guide they finished the steps", nothing more.
 */
import { evaluateGuideTaskAccess, type GuideEffectiveAuth } from "./guide-auth";
import type { GuideClientAction } from "./guide-actions";
import {
  advanceGuideWorkflow,
  findGuideWorkflowById,
  matchGuideWorkflow,
  type GuideWorkflow,
  type GuideWorkflowStep,
} from "./guide-workflows";

// Re-export existing pure helpers so callers have a single runtime entry point.
export { advanceGuideWorkflow, findGuideWorkflowById, matchGuideWorkflow };

export type GuideWorkflowStatus =
  | "active"
  | "awaiting_confirm"
  | "completed"
  | "cancelled"
  | "denied";

export type GuideWorkflowDeniedReason =
  | "missing_context"
  | "missing_permissions"
  | "unknown_workflow"
  | "navigation_denied";

export type GuideWorkflowState = {
  workflowId: string;
  stepIndex: number;
  status: GuideWorkflowStatus;
  /**
   * True when the current step asked the host to open a page. The host must call
   * `acknowledgeNavigation()` once it has attempted (and authorized) navigation.
   * This is NOT a business-operation success marker.
   */
  navigationRequested?: boolean;
  /** Route requested by the current step (registry id), when navigationRequested. */
  navigationRouteId?: string;
  deniedReason?: GuideWorkflowDeniedReason;
};

export type GuideWorkflowStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const GUIDE_WORKFLOW_STORAGE_PREFIX = "valueor-guide-workflow:";

export function guideWorkflowStorageKey(conversationId: string): string {
  return `${GUIDE_WORKFLOW_STORAGE_PREFIX}${conversationId}`;
}

/** `connect_whatsapp` -> `floatingAi.guide.workflows.connectWhatsapp.title` */
export function guideWorkflowTitleKey(workflowId: string): string {
  const camel = workflowId.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
  return `floatingAi.guide.workflows.${camel}.title`;
}

export function isGuideWorkflowTerminal(state: GuideWorkflowState | null): boolean {
  return (
    state?.status === "completed" || state?.status === "cancelled" || state?.status === "denied"
  );
}

export function isGuideWorkflowLive(state: GuideWorkflowState | null): boolean {
  return state?.status === "active" || state?.status === "awaiting_confirm";
}

export function getGuideWorkflowStep(state: GuideWorkflowState): {
  workflow: GuideWorkflow;
  step: GuideWorkflowStep;
} | null {
  const workflow = findGuideWorkflowById(state.workflowId);
  const step = workflow?.steps[state.stepIndex];
  if (!workflow || !step) return null;
  return { workflow, step };
}

function enterStep(workflowId: string, stepIndex: number): GuideWorkflowState | null {
  const workflow = findGuideWorkflowById(workflowId);
  const step = workflow?.steps[stepIndex];
  if (!workflow || !step) return null;
  const state: GuideWorkflowState = {
    workflowId,
    stepIndex,
    status: step.awaitUserConfirmation ? "awaiting_confirm" : "active",
  };
  if (step.navigateRouteId) {
    state.navigationRequested = true;
    state.navigationRouteId = step.navigateRouteId;
  }
  return state;
}

function resolveDefaultStorage(): GuideWorkflowStorage | null {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {
    // sessionStorage can throw in sandboxed contexts.
  }
  return null;
}

function parseStoredState(raw: string | null): GuideWorkflowState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<GuideWorkflowState>;
    if (typeof data.workflowId !== "string" || typeof data.stepIndex !== "number") return null;
    if (data.status !== "active" && data.status !== "awaiting_confirm") return null;
    if (!Number.isInteger(data.stepIndex) || data.stepIndex < 0) return null;
    // Re-derive status/navigation from the definition; never trust stored navigation flags.
    const entered = enterStep(data.workflowId, data.stepIndex);
    if (!entered) return null;
    delete entered.navigationRequested;
    delete entered.navigationRouteId;
    return entered;
  } catch {
    return null;
  }
}

export type GuideWorkflowRuntimeOptions = {
  /** Conversation scoping the stored progress. Null = in-memory only. */
  conversationId: string | null;
  storage?: GuideWorkflowStorage | null;
  /** Used to deny a workflow when effective permissions fail. */
  getAuth?: () => GuideEffectiveAuth | null;
};

export type GuideWorkflowRuntime = {
  getState(): GuideWorkflowState | null;
  subscribe(listener: () => void): () => void;
  startWorkflow(id: string, stepIndex?: number): GuideWorkflowState | null;
  startFromMatch(userText: string): GuideWorkflowState | null;
  startFromAction(action: GuideClientAction): GuideWorkflowState | null;
  /** User confirmed the current step (or finished the final one). */
  confirmStep(): GuideWorkflowState | null;
  goBack(): GuideWorkflowState | null;
  cancelWorkflow(): GuideWorkflowState | null;
  /** Host attempted the navigation requested by the current step. */
  acknowledgeNavigation(): void;
  denyWorkflow(reason: GuideWorkflowDeniedReason): GuideWorkflowState | null;
  /** Reload stored progress for this conversation (no navigation is re-requested). */
  resume(): GuideWorkflowState | null;
  /** Clear terminal / current state from memory and storage. */
  dismiss(): void;
};

export function createGuideWorkflowRuntime(
  options: GuideWorkflowRuntimeOptions,
): GuideWorkflowRuntime {
  const { conversationId, getAuth } = options;
  const storage = options.storage === undefined ? resolveDefaultStorage() : options.storage;
  const storageKey = conversationId ? guideWorkflowStorageKey(conversationId) : null;
  const listeners = new Set<() => void>();
  let state: GuideWorkflowState | null = null;

  function persist(): void {
    if (!storage || !storageKey) return;
    try {
      if (state && isGuideWorkflowLive(state)) {
        storage.setItem(
          storageKey,
          JSON.stringify({
            workflowId: state.workflowId,
            stepIndex: state.stepIndex,
            status: state.status,
          }),
        );
      } else {
        storage.removeItem(storageKey);
      }
    } catch {
      // Persistence is best-effort.
    }
  }

  function commit(next: GuideWorkflowState | null): GuideWorkflowState | null {
    state = next;
    persist();
    for (const listener of listeners) listener();
    return state;
  }

  function deny(
    workflowId: string,
    stepIndex: number,
    reason: GuideWorkflowDeniedReason,
  ): GuideWorkflowState {
    return commit({ workflowId, stepIndex, status: "denied", deniedReason: reason })!;
  }

  function startWorkflow(id: string, stepIndex = 0): GuideWorkflowState | null {
    const workflow = findGuideWorkflowById(id);
    if (!workflow) return null;
    const index =
      Number.isInteger(stepIndex) && stepIndex >= 0 && stepIndex < workflow.steps.length
        ? stepIndex
        : 0;

    const denied = checkAccess(workflow);
    if (denied) return deny(id, index, denied);
    return commit(enterStep(id, index));
  }

  function checkAccess(workflow: GuideWorkflow): GuideWorkflowDeniedReason | null {
    if (!getAuth) return null;
    const auth = getAuth();
    if (!auth) return "missing_context";
    const decision = evaluateGuideTaskAccess(auth, workflow.requiredTask);
    if (decision.allowed) return null;
    return decision.reason === "missing_context" ? "missing_context" : "missing_permissions";
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startWorkflow,
    startFromMatch(userText) {
      const match = matchGuideWorkflow(userText);
      return match ? startWorkflow(match.id) : null;
    },
    startFromAction(action) {
      if (action.type !== "workflow") return null;
      return startWorkflow(action.workflowId, action.stepIndex ?? 0);
    },
    confirmStep() {
      if (!state || !isGuideWorkflowLive(state)) return state;
      const next = advanceGuideWorkflow(
        { workflowId: state.workflowId, stepIndex: state.stepIndex },
        true,
      );
      if (!next) {
        // Steps exhausted: the user says they finished. Guide never verifies a write.
        return commit({
          workflowId: state.workflowId,
          stepIndex: state.stepIndex,
          status: "completed",
        });
      }
      return commit(enterStep(next.workflowId, next.stepIndex));
    },
    goBack() {
      if (!state || !isGuideWorkflowLive(state) || state.stepIndex <= 0) return state;
      return commit(enterStep(state.workflowId, state.stepIndex - 1));
    },
    cancelWorkflow() {
      if (!state || !isGuideWorkflowLive(state)) return state;
      return commit({
        workflowId: state.workflowId,
        stepIndex: state.stepIndex,
        status: "cancelled",
      });
    },
    acknowledgeNavigation() {
      if (!state?.navigationRequested) return;
      const { navigationRequested: _n, navigationRouteId: _r, ...rest } = state;
      commit(rest);
    },
    denyWorkflow(reason) {
      if (!state) return null;
      return deny(state.workflowId, state.stepIndex, reason);
    },
    resume() {
      if (!storage || !storageKey) return state;
      let stored: GuideWorkflowState | null = null;
      try {
        stored = parseStoredState(storage.getItem(storageKey));
      } catch {
        stored = null;
      }
      if (!stored) return state;
      const workflow = findGuideWorkflowById(stored.workflowId);
      const denied = workflow ? checkAccess(workflow) : "unknown_workflow";
      if (denied) return deny(stored.workflowId, stored.stepIndex, denied);
      return commit(stored);
    },
    dismiss() {
      commit(null);
    },
  };
}
