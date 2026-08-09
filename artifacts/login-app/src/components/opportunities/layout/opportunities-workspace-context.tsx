import { createContext, useContext, type ReactNode } from "react";

export type OpportunitiesWorkspaceContextValue = {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
};

const OpportunitiesWorkspaceContext = createContext<OpportunitiesWorkspaceContextValue | null>(null);

export function OpportunitiesWorkspaceProvider({
  value,
  children,
}: {
  value: OpportunitiesWorkspaceContextValue;
  children: ReactNode;
}) {
  return (
    <OpportunitiesWorkspaceContext.Provider value={value}>
      {children}
    </OpportunitiesWorkspaceContext.Provider>
  );
}

export function useOpportunitiesWorkspace(): OpportunitiesWorkspaceContextValue {
  const ctx = useContext(OpportunitiesWorkspaceContext);
  if (!ctx) {
    throw new Error("useOpportunitiesWorkspace must be used within OpportunitiesWorkspaceProvider");
  }
  return ctx;
}
