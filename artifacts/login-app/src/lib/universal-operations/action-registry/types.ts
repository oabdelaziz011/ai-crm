import type { LucideIcon } from "lucide-react";
import type {
  EnterpriseWorkflowEngine,
  OperationsRow,
  OperationsWorkspaceConfig,
  WorkflowActorRole,
} from "@workspace/universal-operations-engine";

export type ActionGroupId =
  | "general"
  | "workflow"
  | "billing"
  | "communication"
  | "assignment"
  | "ai"
  | "history"
  | "danger";

export type ActionDialogKind = "none" | "confirm" | "drawer" | "wizard" | "modal";

export type ActionPermissionMode = "hide" | "disable";

/** Where the action may appear. Defaults to menu only. */
export type ActionSurface = "menu" | "quickBar";

/** @deprecated Prefer WorkflowActorRole from the Enterprise Workflow Engine. */
export type ClinicActingRole = WorkflowActorRole;

export type OperationsActionCommands = {
  checkIn: (bookingId: string) => Promise<unknown>;
  checkOut: (bookingId: string) => Promise<unknown>;
  cancelBooking: (input: { bookingId: string; reason?: string }) => Promise<unknown>;
  markNoShow: (input: { bookingId: string; gracePeriodMinutes?: number }) => Promise<unknown>;
  collectPayment: (input: {
    customerId: string;
    amountCents: number;
    currency: string;
    method: string;
    invoiceId?: string;
    bookingId?: string;
    discountCents?: number;
    taxCents?: number;
    serviceDescription?: string;
    servicePriceCents?: number;
  }) => Promise<unknown>;
  assignEmployee: (input: { bookingId: string; employeeId: string }) => Promise<unknown>;
  rescheduleBooking: (input: {
    bookingId: string;
    newScheduledAt: string;
    reason?: string;
  }) => Promise<unknown>;
  transitionClinicStatus: (input: {
    bookingId: string;
    status: "with_nurse" | "in_progress" | "archived";
  }) => Promise<unknown>;
  completeTriage: (input: { bookingId: string }) => Promise<unknown>;
  generateInvoice: (input: {
    customerId: string;
    amountCents: number;
    currency: string;
  }) => Promise<unknown>;
};

export type OperationsActionRuntime = {
  row: OperationsRow;
  config: OperationsWorkspaceConfig | undefined;
  hasPermission: (code: string) => boolean;
  isSuperAdmin: boolean;
  /**
   * Resolved workflow actor role (via WorkflowDefinition.roleAliases).
   * Role matrices live on workflow transitions — not in UI components.
   */
  actorRole?: WorkflowActorRole;
  /** @deprecated Use actorRole */
  clinicRole?: ClinicActingRole;
  /** Industry workflow engine for the active template — gates transition actions. */
  workflow?: EnterpriseWorkflowEngine;
  featureFlags: Record<string, boolean>;
  commandsReady: boolean;
  openCustomer360: (row: OperationsRow) => void;
  navigate: (path: string) => void;
  commands: OperationsActionCommands;
  communication: {
    call: (phone: string) => void;
    openWhatsApp: (input: { customerId: string; phone?: string | null }) => Promise<void>;
  };
};

export type ActionConfirmation = {
  titleKey: string;
  descriptionKey: string;
};

export type OperationsActionDefinition = {
  id: string;
  titleKey: string;
  icon: LucideIcon;
  group: ActionGroupId;
  order: number;
  requiredPermissions: string[];
  /**
   * Fallback role gate when no workflow engine is bound (or action is not workflow-bound).
   * Prefer WorkflowTransitionDefinition.actorRoles on the Enterprise Workflow Engine.
   */
  clinicRoles?: ClinicActingRole[];
  actorRoles?: WorkflowActorRole[];
  permissionMode?: ActionPermissionMode;
  /**
   * Fallback status gate when no workflow engine is bound.
   * Prefer WorkflowTransitionDefinition.from on the Enterprise Workflow Engine.
   */
  supportedStatuses?: string[];
  supportedOperationTypes?: string[];
  confirmation?: ActionConfirmation;
  dialog?: ActionDialogKind;
  surfaces?: ActionSurface[];
  /** When true, action is shown disabled with Coming Soon — no backend invented. */
  comingSoon?: boolean;
  destructive?: boolean;
  /** When false, successful execution does not toast (navigation / open panel). Default true. */
  toastOnSuccess?: boolean;
  visible: (runtime: OperationsActionRuntime) => boolean;
  enabled: (runtime: OperationsActionRuntime) => boolean;
  execute: (runtime: OperationsActionRuntime) => Promise<void> | void;
};

export type ResolvedOperationsAction = {
  id: string;
  titleKey: string;
  title: string;
  icon: LucideIcon;
  group: ActionGroupId;
  order: number;
  enabled: boolean;
  disabledReasonKey?: string;
  destructive?: boolean;
  confirmation?: ActionConfirmation;
  dialog: ActionDialogKind;
  comingSoon?: boolean;
  surfaces: ActionSurface[];
};

export type ActionGroupSection = {
  group: ActionGroupId;
  labelKey: string;
  actions: ResolvedOperationsAction[];
};
