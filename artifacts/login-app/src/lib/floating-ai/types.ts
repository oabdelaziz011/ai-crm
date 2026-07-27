/** Entity types the assistant can be aware of */
export type FloatingAiEntityType = "customer" | "invoice" | "booking" | "employee" | "document" | "service";

export type FloatingAiEntity = {
  type: FloatingAiEntityType;
  id: string;
  label: string;
  /** Display reference e.g. INV-000124 */
  reference?: string;
  metadata?: Record<string, unknown>;
};

export type FloatingAiPageContext = {
  page: string;
  moduleLabel?: string;
  pageTitle?: string;
  route?: string;
  companyId?: string | null;
  companyName?: string | null;
  userId?: string | null;
  userName?: string | null;
  /** Primary entity in focus (customer, invoice, booking, employee) */
  currentEntity?: FloatingAiEntity | null;
  selectedCustomer?: { id: string; name: string } | null;
  selectedInvoice?: { id: string; label?: string } | null;
  selectedBooking?: { id: string; label?: string } | null;
  selectedEmployee?: { id: string; name: string } | null;
  selectedRows?: Array<{ id: string; label: string }>;
  selectedCount?: number;
  filters?: Record<string, unknown>;
  bookingId?: string | null;
  selectedDate?: string | null;
  [key: string]: unknown;
};

/** Structured metadata passed to runtime — never appended to user message text */
export type FloatingAiRuntimeMetadata = {
  module: string;
  moduleLabel?: string;
  route?: string;
  pageTitle?: string;
  company: { id: string | null; name: string | null };
  user: { id: string | null; name: string | null };
  currentEntity: FloatingAiEntity | null;
  selectedRows: Array<{ id: string; label: string }>;
  selectedCount: number;
  filters: Record<string, unknown>;
  capturedAt: string;
};

export type FloatingAiQuickAction = {
  id: string;
  labelKey: string;
  prompt?: string;
  navigateTo?: string;
  /** Destructive actions require confirmation before execution */
  destructive?: boolean;
};

export type AiPanelSize = "small" | "medium" | "large" | "fullscreen";

export const AI_PANEL_SIZE_DIMENSIONS: Record<
  Exclude<AiPanelSize, "fullscreen">,
  { width: number; height: number }
> = {
  small: { width: 360, height: 480 },
  medium: { width: 420, height: 600 },
  large: { width: 520, height: 720 },
};

/** Background task tracked while panel is minimized */
export type FloatingAiTaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type FloatingAiTask = {
  id: string;
  label: string;
  status: FloatingAiTaskStatus;
  progress: number;
  message?: string;
  startedAt: string;
  completedAt?: string;
  /** Continues when panel is minimized */
  background: boolean;
};

/** Slash command definition */
export type FloatingAiSlashCommand = {
  command: string;
  labelKey: string;
  descriptionKey: string;
  prompt: string;
  destructive?: boolean;
  /** Routes to Agent tab and starts a workflow instead of chat */
  agentMode?: boolean;
};

/** Future capability flags — extension points without redesign */
export type FloatingAiCapabilities = {
  voice: boolean;
  screenSharing: boolean;
  imageUpload: boolean;
  documentUpload: boolean;
  liveSuggestions: boolean;
  agentMode: boolean;
  multiAgent: boolean;
  backgroundAutomations: boolean;
};

export const FLOATING_AI_CAPABILITIES: FloatingAiCapabilities = {
  voice: false,
  screenSharing: false,
  imageUpload: false,
  documentUpload: false,
  liveSuggestions: false,
  agentMode: true,
  multiAgent: false,
  backgroundAutomations: true,
};

/** Fields cleared when leaving a module page (smart context switch) */
export const PAGE_SPECIFIC_CONTEXT_KEYS: (keyof FloatingAiPageContext)[] = [
  "currentEntity",
  "selectedCustomer",
  "selectedInvoice",
  "selectedBooking",
  "selectedEmployee",
  "selectedRows",
  "selectedCount",
  "filters",
  "bookingId",
  "selectedDate",
  "moduleLabel",
  "pageTitle",
];
