import { lazy, Suspense, type ReactNode } from "react";

const CanvasSyncTraceProvider = lazy(() =>
  import("./canvas-sync-trace-provider").then((module) => ({ default: module.CanvasSyncTraceProvider })),
);

export function WorkflowBuilderCanvasSyncTraceBoundary({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={children}>
      <CanvasSyncTraceProvider>{children}</CanvasSyncTraceProvider>
    </Suspense>
  );
}
