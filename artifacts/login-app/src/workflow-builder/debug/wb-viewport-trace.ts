/** Temporary viewport mutation instrumentation — investigation only. */
import { wbDebug } from "./wb-runtime-debug";

export type ViewportSnapshot = { x: number; y: number; zoom: number };

let lastKnownViewport: ViewportSnapshot | null = null;

function captureStack(): string {
  const stack = new Error().stack ?? "";
  return stack
    .split("\n")
    .slice(2, 10)
    .map((line) => line.trim())
    .join(" | ");
}

export function wbTraceViewportMutation(
  caller: string,
  method: string,
  input: {
    reason: string;
    nextViewport?: Partial<ViewportSnapshot>;
    args?: unknown;
    getCurrentViewport?: () => ViewportSnapshot | null;
  },
) {
  const previous = input.getCurrentViewport?.() ?? lastKnownViewport;
  const next = input.nextViewport ?? previous;
  if (next) {
    lastKnownViewport = {
      x: next.x ?? previous?.x ?? 0,
      y: next.y ?? previous?.y ?? 0,
      zoom: next.zoom ?? previous?.zoom ?? 1,
    };
  }

  wbDebug("VIEWPORT MUTATION", {
    caller,
    method,
    reason: input.reason,
    previousZoom: previous?.zoom ?? null,
    nextZoom: lastKnownViewport?.zoom ?? null,
    previous,
    next: lastKnownViewport,
    args: input.args,
    stack: captureStack(),
  });
}

export function wbReadRfViewport(): ViewportSnapshot | null {
  if (typeof document === "undefined") return null;
  const pane = document.querySelector(".react-flow__viewport") as HTMLElement | null;
  if (!pane) return null;
  const transform = window.getComputedStyle(pane).transform;
  if (!transform || transform === "none") {
    return lastKnownViewport ?? { x: 0, y: 0, zoom: 1 };
  }
  const matrix = transform.match(/matrix\(([^)]+)\)/);
  if (!matrix?.[1]) return lastKnownViewport;
  const parts = matrix[1].split(",").map((value) => Number.parseFloat(value.trim()));
  if (parts.length < 6) return lastKnownViewport;
  const zoom = parts[0] ?? 1;
  const x = parts[4] ?? 0;
  const y = parts[5] ?? 0;
  const snapshot = { x, y, zoom };
  lastKnownViewport = snapshot;
  return snapshot;
}

export function wbTraceViewportPoll(source: string) {
  const viewport = wbReadRfViewport();
  wbDebug("VIEWPORT POLL", { source, viewport });
  return viewport;
}
