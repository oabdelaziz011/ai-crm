import { useCallback, useEffect, useState } from "react";

export type AgentDeskLayoutState = {
  queueWidth: number;
  queueOpen: boolean;
  insightOpen: boolean;
  conversationMaximized: boolean;
};

const STORAGE_KEY = "agent-desk-layout-v1";

const DEFAULT: AgentDeskLayoutState = {
  queueWidth: 320,
  queueOpen: false,
  insightOpen: false,
  conversationMaximized: false,
};

function load(): AgentDeskLayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<AgentDeskLayoutState>;
    return {
      queueWidth: clamp(parsed.queueWidth ?? DEFAULT.queueWidth, 260, 480),
      queueOpen: parsed.queueOpen ?? DEFAULT.queueOpen,
      insightOpen: parsed.insightOpen ?? DEFAULT.insightOpen,
      conversationMaximized: parsed.conversationMaximized ?? DEFAULT.conversationMaximized,
    };
  } catch {
    return DEFAULT;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function useAgentDeskLayout() {
  const [layout, setLayout] = useState<AgentDeskLayoutState>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  const setQueueWidth = useCallback((queueWidth: number) => {
    setLayout((current) => ({ ...current, queueWidth: clamp(queueWidth, 260, 480) }));
  }, []);

  const setQueueOpen = useCallback((queueOpen: boolean) => {
    setLayout((current) => ({ ...current, queueOpen }));
  }, []);

  const setInsightOpen = useCallback((insightOpen: boolean) => {
    setLayout((current) => ({ ...current, insightOpen, conversationMaximized: insightOpen ? false : current.conversationMaximized }));
  }, []);

  const toggleConversationMaximized = useCallback(() => {
    setLayout((current) => ({
      ...current,
      conversationMaximized: !current.conversationMaximized,
      insightOpen: !current.conversationMaximized ? false : current.insightOpen,
      queueOpen: !current.conversationMaximized ? false : current.queueOpen,
    }));
  }, []);

  return {
    layout,
    setQueueWidth,
    setQueueOpen,
    setInsightOpen,
    toggleConversationMaximized,
  };
}
