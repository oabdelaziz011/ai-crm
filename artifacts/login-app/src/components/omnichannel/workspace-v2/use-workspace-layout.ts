import { useCallback, useEffect, useState } from "react";



export type WorkspaceLayoutState = {

  intelligenceOpen: boolean;

  mobileView: "list" | "conversation";

};



const STORAGE_KEY = "agent-workspace-v2-layout";



const DEFAULT: WorkspaceLayoutState = {

  intelligenceOpen: true,

  mobileView: "list",

};



function load(): WorkspaceLayoutState {

  try {

    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return DEFAULT;

    const parsed = JSON.parse(raw) as Partial<WorkspaceLayoutState> & { customer360Open?: boolean };

    return {

      intelligenceOpen: parsed.intelligenceOpen ?? DEFAULT.intelligenceOpen,

      mobileView: parsed.mobileView ?? DEFAULT.mobileView,

    };

  } catch {

    return DEFAULT;

  }

}



export function useWorkspaceLayout() {

  const [layout, setLayout] = useState<WorkspaceLayoutState>(load);



  useEffect(() => {

    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));

  }, [layout]);



  const setIntelligenceOpen = useCallback((intelligenceOpen: boolean) => {

    setLayout((current) => ({ ...current, intelligenceOpen }));

  }, []);



  const toggleIntelligence = useCallback(() => {

    setLayout((current) => ({ ...current, intelligenceOpen: !current.intelligenceOpen }));

  }, []);



  const setMobileView = useCallback((mobileView: "list" | "conversation") => {

    setLayout((current) => ({ ...current, mobileView }));

  }, []);



  return {

    layout,

    setIntelligenceOpen,

    toggleIntelligence,

    setMobileView,

  };

}

