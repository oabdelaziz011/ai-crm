import type { ReactNode } from "react";

export type KanbanMetric = {
  id: string;
  label: string;
  value: string;
  hint?: string;
};

export type KanbanFilterOption = {
  id: string;
  label: string;
};

export type KanbanFiltersState = {
  search: string;
  ownerId: string | null;
  sourceId: string | null;
  scoreBand: string | null;
  city: string | null;
  country: string | null;
  stageId: string | null;
  valueMin: string;
  valueMax: string;
  createdFrom: string;
  createdTo: string;
  lastActivityFrom: string;
  lastActivityTo: string;
  tag: string | null;
};

export const EMPTY_KANBAN_FILTERS: KanbanFiltersState = {
  search: "",
  ownerId: null,
  sourceId: null,
  scoreBand: null,
  city: null,
  country: null,
  stageId: null,
  valueMin: "",
  valueMax: "",
  createdFrom: "",
  createdTo: "",
  lastActivityFrom: "",
  lastActivityTo: "",
  tag: null,
};

export type KanbanCardCounter = {
  id: string;
  label: string;
  count: number;
  icon?: ReactNode;
};

export type KanbanQuickAction = {
  id: string;
  label: string;
  /** Native tooltip / accessibility label — must match the action (defaults to label). */
  title?: string;
  onSelect: () => void;
  disabled?: boolean;
};

export type KanbanContextAction = {
  id: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

export type KanbanCardModel<TData = unknown> = {
  id: string;
  columnId: string;
  title: string;
  subtitle?: string | null;
  valueLabel?: string | null;
  scoreLabel?: string | null;
  scoreTone?: "cold" | "warm" | "hot" | "urgent";
  ownerLabel?: string | null;
  nextActivityLabel?: string | null;
  lastActivityLabel?: string | null;
  sourceLabel?: string | null;
  counters?: readonly KanbanCardCounter[];
  aiSummary?: string | null;
  winProbabilityLabel?: string | null;
  nextBestAction?: string | null;
  suggestedFollowUp?: string | null;
  data: TData;
};

export type KanbanColumnModel<TData = unknown> = {
  id: string;
  title: string;
  countLabel: string;
  valueLabel: string;
  accentClassName?: string;
  cards: readonly KanbanCardModel<TData>[];
};

export type KanbanPipelineOption = {
  id: string;
  label: string;
};

export type EnterpriseKanbanLabels = {
  pageTitle: string;
  pipeline: string;
  searchPlaceholder: string;
  filters: string;
  customizeColumns: string;
  create: string;
  emptyColumn: string;
  addInColumn: string;
  dropHere: string;
  moveSuccess: string;
  quickActions: string;
  more: string;
  openDrawer: string;
  /** Accessible name for the KPI metrics strip. */
  metricsGroup?: string;
};
