import type { BuilderNodeType } from "../types";

export type VisualCategory = "conversation" | "crm" | "logic" | "timing" | "ai" | "terminal";

export type CategoryVisualTokens = {
  label: string;
  accent: string;
  border: string;
  iconBg: string;
  iconColor: string;
  handle: string;
  ring: string;
};

export const CATEGORY_VISUAL_TOKENS: Record<VisualCategory, CategoryVisualTokens> = {
  conversation: {
    label: "Conversation",
    accent: "from-sky-500/15 via-sky-400/5 to-background",
    border: "border-sky-500/30",
    iconBg: "bg-sky-500/15",
    iconColor: "text-sky-600 dark:text-sky-300",
    handle: "bg-sky-500",
    ring: "ring-sky-500/40",
  },
  crm: {
    label: "CRM",
    accent: "from-emerald-500/15 via-emerald-400/5 to-background",
    border: "border-emerald-500/30",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-300",
    handle: "bg-emerald-500",
    ring: "ring-emerald-500/40",
  },
  logic: {
    label: "Logic",
    accent: "from-orange-500/15 via-orange-400/5 to-background",
    border: "border-orange-500/30",
    iconBg: "bg-orange-500/15",
    iconColor: "text-orange-600 dark:text-orange-300",
    handle: "bg-orange-500",
    ring: "ring-orange-500/40",
  },
  timing: {
    label: "Timing",
    accent: "from-violet-500/15 via-violet-400/5 to-background",
    border: "border-violet-500/30",
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-600 dark:text-violet-300",
    handle: "bg-violet-500",
    ring: "ring-violet-500/40",
  },
  ai: {
    label: "AI",
    accent: "from-fuchsia-500/15 via-fuchsia-400/5 to-background",
    border: "border-fuchsia-500/30",
    iconBg: "bg-fuchsia-500/15",
    iconColor: "text-fuchsia-600 dark:text-fuchsia-300",
    handle: "bg-fuchsia-500",
    ring: "ring-fuchsia-500/40",
  },
  terminal: {
    label: "End",
    accent: "from-slate-700/20 via-slate-600/10 to-background",
    border: "border-slate-500/35",
    iconBg: "bg-slate-600/20",
    iconColor: "text-slate-700 dark:text-slate-200",
    handle: "bg-slate-600",
    ring: "ring-slate-500/40",
  },
};

export function resolveVisualCategory(nodeType: BuilderNodeType): VisualCategory {
  if (nodeType === "end") return "terminal";
  if (nodeType === "delay" || nodeType === "wait_for_reply") return "timing";
  if (nodeType === "if_else" || nodeType === "switch" || nodeType === "merge") return "logic";
  if (nodeType === "create_customer" || nodeType === "update_customer" || nodeType === "find_customer" || nodeType === "create_booking") return "crm";
  if (nodeType === "ai_summarizer" || nodeType === "ai_extract" || nodeType === "ai_decision" || nodeType === "ai_knowledge_search") return "ai";
  return "conversation";
}

export function getCategoryTokens(nodeType: BuilderNodeType): CategoryVisualTokens {
  return CATEGORY_VISUAL_TOKENS[resolveVisualCategory(nodeType)];
}
