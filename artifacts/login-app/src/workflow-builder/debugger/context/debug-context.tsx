import { createContext, useContext, type ReactNode } from "react";
import { createDefaultDebugSelectionState, type DebugSelectionState } from "../types/debugger-types";
import type { WorkflowDebuggerController } from "../hooks/use-workflow-debugger";

type DebugContextValue = {
  debugger: WorkflowDebuggerController;
  selection: DebugSelectionState;
};

const DebugContext = createContext<DebugContextValue | null>(null);

export function DebugFoundationProvider({
  debugger: debuggerController,
  children,
}: {
  debugger: WorkflowDebuggerController;
  children: ReactNode;
}) {
  return (
    <DebugContext.Provider
      value={{
        debugger: debuggerController,
        selection: debuggerController.selection ?? createDefaultDebugSelectionState(),
      }}
    >
      {children}
    </DebugContext.Provider>
  );
}

export function useDebugContext() {
  return useContext(DebugContext);
}

export function useDebuggerController() {
  const context = useDebugContext();
  if (!context) {
    throw new Error("useDebuggerController must be used within DebugFoundationProvider");
  }
  return context.debugger;
}

export function useDebugSelection() {
  const context = useDebugContext();
  if (!context) {
    throw new Error("useDebugSelection must be used within DebugFoundationProvider");
  }
  return context.selection;
}

export { createDefaultDebugSelectionState as DEFAULT_DEBUG_SELECTION };
