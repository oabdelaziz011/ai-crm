/**
 * Phase 1C — Interactive step-by-step guidance definitions.
 * Steps never perform configuration; they explain + optionally navigate.
 */
import type { DashboardSectionId } from "@/config/dashboard-route-registry";
import type { GuideTaskId } from "./permission-matrix";

export type GuideWorkflowStep = {
  id: string;
  /** i18n key for step instruction */
  instructionKey: string;
  /** Optional route to open before this step (permission-checked). */
  navigateRouteId?: DashboardSectionId;
  /** Require user confirmation / "done" before advancing. */
  awaitUserConfirmation: boolean;
};

export type GuideWorkflow = {
  id: string;
  /** Natural-language match hints (lowercase English keywords; LLM also uses id). */
  matchHints: readonly string[];
  requiredTask: GuideTaskId;
  steps: readonly GuideWorkflowStep[];
};

export const GUIDE_WORKFLOWS: readonly GuideWorkflow[] = Object.freeze([
  {
    id: "connect_whatsapp",
    matchHints: [
      "connect whatsapp",
      "whatsapp settings",
      "whatsapp to the system",
      "ربط واتساب",
      "ربط الواتساب",
      "اوصل واتساب",
      "اوصل الواتساب",
      "اوصل الواتسب",
      "أوصل واتساب",
      "ازاي اوصل",
      "ازاي أوصل",
      "اذي اقدر اوصل",
      "كيف اوصل واتساب",
      "whatsapp verbinden",
    ],
    requiredTask: "whatsapp.view",
    steps: [
      {
        id: "open_settings",
        instructionKey: "floatingAi.guide.workflows.connectWhatsapp.steps.openSettings",
        navigateRouteId: "whatsapp",
        awaitUserConfirmation: true,
      },
      {
        id: "review_connection",
        instructionKey: "floatingAi.guide.workflows.connectWhatsapp.steps.reviewConnection",
        awaitUserConfirmation: true,
      },
      {
        id: "complete_or_ask_admin",
        instructionKey: "floatingAi.guide.workflows.connectWhatsapp.steps.completeOrAskAdmin",
        awaitUserConfirmation: false,
      },
    ],
  },
  {
    id: "add_customer",
    matchHints: ["add customer", "create customer", "new customer", "إضافة عميل", "kunden anlegen"],
    requiredTask: "customers.create",
    steps: [
      {
        id: "open_customers",
        instructionKey: "floatingAi.guide.workflows.addCustomer.steps.openCustomers",
        navigateRouteId: "customers",
        awaitUserConfirmation: true,
      },
      {
        id: "use_create_ui",
        instructionKey: "floatingAi.guide.workflows.addCustomer.steps.useCreateUi",
        awaitUserConfirmation: true,
      },
      {
        id: "save_in_ui",
        instructionKey: "floatingAi.guide.workflows.addCustomer.steps.saveInUi",
        awaitUserConfirmation: false,
      },
    ],
  },
  {
    id: "create_ticket",
    matchHints: ["create ticket", "new ticket", "فتح تذكرة", "ticket erstellen"],
    requiredTask: "tickets.create",
    steps: [
      {
        id: "open_tickets",
        instructionKey: "floatingAi.guide.workflows.createTicket.steps.openTickets",
        navigateRouteId: "tickets",
        awaitUserConfirmation: true,
      },
      {
        id: "fill_ticket",
        instructionKey: "floatingAi.guide.workflows.createTicket.steps.fillTicket",
        awaitUserConfirmation: false,
      },
    ],
  },
  {
    id: "grant_permission",
    matchHints: ["grant permission", "change role", "صلاحيات", "berechtigung"],
    requiredTask: "roles.edit",
    steps: [
      {
        id: "open_roles",
        instructionKey: "floatingAi.guide.workflows.grantPermission.steps.openRoles",
        navigateRouteId: "roles",
        awaitUserConfirmation: true,
      },
      {
        id: "edit_role",
        instructionKey: "floatingAi.guide.workflows.grantPermission.steps.editRole",
        awaitUserConfirmation: false,
      },
    ],
  },
]);

export function findGuideWorkflowById(id: string): GuideWorkflow | null {
  return GUIDE_WORKFLOWS.find((w) => w.id === id) ?? null;
}

/** Normalize colloquial WhatsApp spellings so Egyptian/Arabic variants still match. */
function normalizeGuideWorkflowText(userText: string): string {
  return userText
    .trim()
    .toLowerCase()
    .replace(/الواتسب/g, "الواتساب")
    .replace(/واتسب/g, "واتساب")
    .replace(/اذي/g, "ازاي")
    .replace(/أذي/g, "ازاي");
}

export function matchGuideWorkflow(userText: string): GuideWorkflow | null {
  const normalized = normalizeGuideWorkflowText(userText);
  if (!normalized) return null;
  for (const workflow of GUIDE_WORKFLOWS) {
    if (workflow.matchHints.some((hint) => normalized.includes(hint.toLowerCase()))) {
      return workflow;
    }
  }
  // Connect WhatsApp: verb + whatsapp even when hint phrasing differs.
  if (
    /whatsapp|واتساب/.test(normalized) &&
    /(connect|verbinden|ربط|اوصل|أوصل|ازاي|كيف)/.test(normalized)
  ) {
    return findGuideWorkflowById("connect_whatsapp");
  }
  return null;
}

export type GuideWorkflowProgress = {
  workflowId: string;
  stepIndex: number;
};

export function advanceGuideWorkflow(
  progress: GuideWorkflowProgress,
  userConfirmed: boolean,
): GuideWorkflowProgress | null {
  const workflow = findGuideWorkflowById(progress.workflowId);
  if (!workflow) return null;
  const current = workflow.steps[progress.stepIndex];
  if (!current) return null;
  if (current.awaitUserConfirmation && !userConfirmed) {
    return progress;
  }
  const next = progress.stepIndex + 1;
  if (next >= workflow.steps.length) return null;
  return { workflowId: progress.workflowId, stepIndex: next };
}
