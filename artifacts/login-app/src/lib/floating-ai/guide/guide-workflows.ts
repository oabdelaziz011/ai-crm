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
  /**
   * Optional route to open before this step (permission-checked).
   * Use `settings.whatsapp` / `settings.messenger` / `settings.instagram` for channel connect
   * (never the legacy dashboard `whatsapp` Omnichannel redirect).
   */
  navigateRouteId?: DashboardSectionId | `settings.${string}` | string;
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
        navigateRouteId: "settings.whatsapp",
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
    id: "connect_messenger",
    matchHints: [
      "connect messenger",
      "connect facebook messenger",
      "messenger settings",
      "ربط ماسنجر",
      "ربط الماسنجر",
      "اوصل ماسنجر",
      "أوصل ماسنجر",
      "فيسبوك ماسنجر",
      "messenger verbinden",
    ],
    requiredTask: "settings.view",
    steps: [
      {
        id: "open_settings",
        instructionKey: "floatingAi.guide.workflows.connectMessenger.steps.openSettings",
        navigateRouteId: "settings.messenger",
        awaitUserConfirmation: true,
      },
      {
        id: "review_connection",
        instructionKey: "floatingAi.guide.workflows.connectMessenger.steps.reviewConnection",
        awaitUserConfirmation: true,
      },
      {
        id: "complete_or_ask_admin",
        instructionKey: "floatingAi.guide.workflows.connectMessenger.steps.completeOrAskAdmin",
        awaitUserConfirmation: false,
      },
    ],
  },
  {
    id: "connect_instagram",
    matchHints: [
      "connect instagram",
      "instagram settings",
      "ربط انستجرام",
      "ربط الإنستجرام",
      "اوصل انستجرام",
      "أوصل انستجرام",
      "instagram verbinden",
    ],
    requiredTask: "settings.view",
    steps: [
      {
        id: "open_settings",
        instructionKey: "floatingAi.guide.workflows.connectInstagram.steps.openSettings",
        navigateRouteId: "settings.instagram",
        awaitUserConfirmation: true,
      },
      {
        id: "review_connection",
        instructionKey: "floatingAi.guide.workflows.connectInstagram.steps.reviewConnection",
        awaitUserConfirmation: true,
      },
      {
        id: "complete_or_ask_admin",
        instructionKey: "floatingAi.guide.workflows.connectInstagram.steps.completeOrAskAdmin",
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

/** Normalize colloquial channel spellings so Egyptian/Arabic variants still match. */
function normalizeGuideWorkflowText(userText: string): string {
  return userText
    .trim()
    .toLowerCase()
    .replace(/الواتسب/g, "الواتساب")
    .replace(/واتسب/g, "واتساب")
    .replace(/الانستا/g, "انستجرام")
    .replace(/انستا(?!جرام)/g, "انستجرام")
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
  // Channel connect: verb + channel even when hint phrasing differs.
  const wantsConnect = /(connect|verbinden|ربط|اوصل|أوصل|ازاي|كيف)/.test(normalized);
  if (!wantsConnect) return null;
  if (/whatsapp|واتساب/.test(normalized)) {
    return findGuideWorkflowById("connect_whatsapp");
  }
  if (/messenger|ماسنجر|مسنجر/.test(normalized)) {
    return findGuideWorkflowById("connect_messenger");
  }
  if (/instagram|انستجرام|إنستجرام/.test(normalized)) {
    return findGuideWorkflowById("connect_instagram");
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
