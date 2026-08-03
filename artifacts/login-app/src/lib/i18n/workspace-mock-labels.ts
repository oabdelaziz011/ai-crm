import type { TFunction } from "i18next";

const FAVORITE_LABEL_KEYS: Record<string, string> = {
  fav_c1: "workspacePlatform.favorites.items.customerName",
  fav_view_waiting: "workspacePlatform.favorites.items.waitingRoomQueue",
  fav_report_revenue: "workspacePlatform.favorites.items.dailyRevenueReport",
  fav_cmd_collect: "workspacePlatform.commands.collectPayment",
  fav_ws_clinic: "workspacePlatform.favorites.items.clinicWorkspace",
};

const NOTIFICATION_LABEL_KEYS: Record<string, { title: string; message: string }> = {
  n1: {
    title: "workspacePlatform.notifications.mock.n1.title",
    message: "workspacePlatform.notifications.mock.n1.message",
  },
  n2: {
    title: "workspacePlatform.notifications.mock.n2.title",
    message: "workspacePlatform.notifications.mock.n2.message",
  },
  n3: {
    title: "workspacePlatform.notifications.mock.n3.title",
    message: "workspacePlatform.notifications.mock.n3.message",
  },
  n4: {
    title: "workspacePlatform.notifications.mock.n4.title",
    message: "workspacePlatform.notifications.mock.n4.message",
  },
  n5: {
    title: "workspacePlatform.notifications.mock.n5.title",
    message: "workspacePlatform.notifications.mock.n5.message",
  },
  n6: {
    title: "workspacePlatform.notifications.mock.n6.title",
    message: "workspacePlatform.notifications.mock.n6.message",
  },
  n7: {
    title: "workspacePlatform.notifications.mock.n7.title",
    message: "workspacePlatform.notifications.mock.n7.message",
  },
  n8: {
    title: "workspacePlatform.notifications.mock.n8.title",
    message: "workspacePlatform.notifications.mock.n8.message",
  },
};

const ACTIVITY_LABEL_KEYS: Record<string, { title: string; description: string; actor?: string }> = {
  a1: {
    title: "workspacePlatform.activity.mock.customerCreated.title",
    description: "workspacePlatform.activity.mock.customerCreated.description",
    actor: "workspacePlatform.activity.mock.customerCreated.actor",
  },
  a2: {
    title: "workspacePlatform.activity.mock.leadConverted.title",
    description: "workspacePlatform.activity.mock.leadConverted.description",
    actor: "workspacePlatform.activity.mock.leadConverted.actor",
  },
  a3: {
    title: "workspacePlatform.activity.mock.paymentCollected.title",
    description: "workspacePlatform.activity.mock.paymentCollected.description",
    actor: "workspacePlatform.activity.mock.paymentCollected.actor",
  },
  a4: {
    title: "workspacePlatform.activity.mock.whatsappSent.title",
    description: "workspacePlatform.activity.mock.whatsappSent.description",
    actor: "workspacePlatform.activity.mock.whatsappSent.actor",
  },
  a5: {
    title: "workspacePlatform.activity.mock.employeeAssigned.title",
    description: "workspacePlatform.activity.mock.employeeAssigned.description",
    actor: "workspacePlatform.activity.mock.employeeAssigned.actor",
  },
  a6: {
    title: "workspacePlatform.activity.mock.invoiceGenerated.title",
    description: "workspacePlatform.activity.mock.invoiceGenerated.description",
    actor: "workspacePlatform.activity.mock.invoiceGenerated.actor",
  },
  a7: {
    title: "workspacePlatform.activity.mock.taskCompleted.title",
    description: "workspacePlatform.activity.mock.taskCompleted.description",
    actor: "workspacePlatform.activity.mock.taskCompleted.actor",
  },
  a8: {
    title: "workspacePlatform.activity.mock.aiSummary.title",
    description: "workspacePlatform.activity.mock.aiSummary.description",
    actor: "workspacePlatform.activity.mock.aiSummary.actor",
  },
  a9: {
    title: "workspacePlatform.activity.mock.workflowTriggered.title",
    description: "workspacePlatform.activity.mock.workflowTriggered.description",
    actor: "workspacePlatform.activity.mock.workflowTriggered.actor",
  },
  a10: {
    title: "workspacePlatform.activity.mock.paymentCollected2.title",
    description: "workspacePlatform.activity.mock.paymentCollected2.description",
    actor: "workspacePlatform.activity.mock.paymentCollected2.actor",
  },
  a11: {
    title: "workspacePlatform.activity.mock.customerCreated2.title",
    description: "workspacePlatform.activity.mock.customerCreated2.description",
    actor: "workspacePlatform.activity.mock.customerCreated2.actor",
  },
};

const WIDGET_POINT_LABEL_KEYS: Record<string, Record<string, string>> = {
  revenue_today: { r1: "today", r2: "target" },
  upcoming_bookings: { b1: "next2h", b2: "today" },
  pending_payments: { p1: "outstanding", p2: "overdue" },
  employee_status: { e1: "onDuty", e2: "late" },
  ai_recommendations: { a1: "pending", a2: "highConfidence" },
  tasks: { t1: "open", t2: "dueToday" },
  kpi_leaderboard: { l1: "topPerformer", l2: "revenue" },
};

export function translateFavoriteLabel(t: TFunction, id: string, fallback: string): string {
  const key = FAVORITE_LABEL_KEYS[id];
  return key ? t(key) : fallback;
}

export function translateNotificationTitle(t: TFunction, id: string, fallback: string): string {
  const keys = NOTIFICATION_LABEL_KEYS[id];
  return keys ? t(keys.title) : fallback;
}

export function translateNotificationMessage(t: TFunction, id: string, fallback: string): string {
  const keys = NOTIFICATION_LABEL_KEYS[id];
  return keys ? t(keys.message) : fallback;
}

export function translateActivityTitle(t: TFunction, id: string, fallback: string): string {
  const keys = ACTIVITY_LABEL_KEYS[id];
  return keys ? t(keys.title) : fallback;
}

export function translateActivityDescription(t: TFunction, id: string, fallback: string): string {
  const keys = ACTIVITY_LABEL_KEYS[id];
  return keys ? t(keys.description) : fallback;
}

export function translateActivityActor(t: TFunction, id: string, fallback: string): string {
  const keys = ACTIVITY_LABEL_KEYS[id];
  return keys?.actor ? t(keys.actor) : fallback;
}

export function translateWidgetPointLabel(
  t: TFunction,
  widgetType: string,
  pointId: string,
  fallback: string,
): string {
  const pointKey = WIDGET_POINT_LABEL_KEYS[widgetType]?.[pointId];
  if (!pointKey) return fallback;
  return t(`workspacePlatform.widgets.points.${pointKey}`);
}

export function translateOperationsWorkspaceName(
  t: TFunction,
  templateKey: string,
  fallback: string,
): string {
  const key = `universalOperations.workspaceNames.${templateKey}`;
  const translated = t(key);
  return translated === key ? fallback : translated;
}

export function translateLeadLifecycleStatus(t: TFunction, status: string): string {
  const key = `leads.lifecycle.${status}`;
  const translated = t(key);
  return translated === key ? status.replace(/_/g, " ") : translated;
}

export function translateIntelligenceAlertTitle(t: TFunction, alertType: string, fallback: string): string {
  const key = `intelligence.alertRules.${alertType}.title`;
  const translated = t(key);
  return translated === key ? fallback : translated;
}

export function translateIntelligenceAlertMessage(t: TFunction, alertType: string, fallback: string): string {
  const key = `intelligence.alertRules.${alertType}.message`;
  const translated = t(key);
  return translated === key ? fallback : translated;
}

export function translateWorkflowStageLabel(t: TFunction, stageId: string, fallback: string): string {
  const key = `intelligence.workflowStages.${stageId}`;
  const translated = t(key);
  return translated === key ? fallback : translated;
}

export function translateRecommendationTitle(t: TFunction, labelKey: string, fallback: string): string {
  const key = `intelligence.${labelKey}`;
  const translated = t(key);
  return translated === key ? fallback : translated;
}

export function translateRecommendationReason(t: TFunction, recId: string, fallback: string): string {
  const key = `intelligence.recReasons.${recId}`;
  const translated = t(key);
  return translated === key ? fallback : translated;
}
