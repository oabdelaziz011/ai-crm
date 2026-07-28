import type { BuilderAction, BuilderState } from "../types";
import { builderReducer } from "./builder-reducer";

export type HistoryState = {
  past: BuilderState[];
  present: BuilderState;
  future: BuilderState[];
};

const HISTORY_LIMIT = 50;

export function createHistoryState(present: BuilderState): HistoryState {
  return { past: [], present, future: [] };
}

export function historyReducer(history: HistoryState, action: BuilderAction): HistoryState {
  if (action.type === "REPLACE_STATE") {
    return createHistoryState(action.state);
  }

  const nextPresent = builderReducer(history.present, action);
  if (nextPresent === history.present) return history;

  const trackHistory =
    ![
      "SET_SAVE_STATUS",
      "SET_VALIDATION",
      "SET_ACTIVE_VALIDATION_ISSUE",
      "REQUEST_VALIDATION_PANEL_FOCUS",
      "SELECT_NODES",
      "SELECT_EDGES",
      "SET_LAYOUT_ANIMATION",
      "FLUSH_HISTORY_BATCH",
      "SET_VIEWPORT",
    ].includes(action.type) &&
    !(action.type === "UPDATE_NODE_POSITIONS" && action.transient) &&
    !(action.type === "UPDATE_NODE_CONFIG" && action.batch) &&
    !(action.type === "SET_METADATA" && action.batch);
  if (!trackHistory) {
    return { ...history, present: nextPresent };
  }

  const past = [...history.past, history.present].slice(-HISTORY_LIMIT);
  return {
    past,
    present: nextPresent,
    future: [],
  };
}

export function undoHistory(history: HistoryState): HistoryState {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1]!;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history: HistoryState): HistoryState {
  if (history.future.length === 0) return history;
  const next = history.future[0]!;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

export function canUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}

export function canRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}
