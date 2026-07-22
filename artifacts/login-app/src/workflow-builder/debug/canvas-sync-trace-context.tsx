import { createContext, useContext } from "react";
import type { CanvasSyncTraceAdapter } from "./canvas-sync-trace-types";

const CanvasSyncTraceContext = createContext<CanvasSyncTraceAdapter | null>(null);

export function useCanvasSyncTrace(): CanvasSyncTraceAdapter | null {
  return useContext(CanvasSyncTraceContext);
}

export { CanvasSyncTraceContext };
