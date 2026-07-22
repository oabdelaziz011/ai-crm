import type { LookupState, LookupStatus } from "./types.js";

export function buildLookupState(count: number): LookupState {
  if (count === 0) {
    return { status: "not_found", count: 0 };
  }
  if (count === 1) {
    return { status: "found", count: 1 };
  }
  return { status: "duplicate", count };
}

export function buildLookupStateFromStatus(status: LookupStatus, count: number): LookupState {
  return { status, count };
}
