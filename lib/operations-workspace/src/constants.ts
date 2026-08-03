export const OPERATIONS_PERMISSIONS = {
  workspaceView: "operations.workspace.view",
  workspaceManage: "operations.workspace.manage",
  paymentCollect: "operations.payment.collect",
  paymentRefund: "operations.payment.refund",
  queueManage: "operations.queue.manage",
  queueCall: "operations.queue.call",
  queueCheckin: "operations.queue.checkin",
  queueComplete: "operations.queue.complete",
  queueCancel: "operations.queue.cancel",
  queueNoShow: "operations.queue.no_show",
  configurationManage: "operations.configuration.manage",
  columnsCustomize: "operations.columns.customize",
  savedViewsManage: "operations.saved_views.manage",
  dashboardView: "operations.dashboard.view",
  revenueView: "operations.revenue.view",
  customerView: "operations.customer.view",
  timelineView: "operations.timeline.view",
  notesManage: "operations.notes.manage",
  appointmentManage: "operations.appointment.manage",
  serviceChange: "operations.service.change",
  discountApply: "operations.discount.apply",
} as const;

export type OperationsPermissionCode =
  (typeof OPERATIONS_PERMISSIONS)[keyof typeof OPERATIONS_PERMISSIONS];

export const OPERATIONS_WORKFLOW_ACTIONS = [
  "call_patient",
  "check_in",
  "start_consultation",
  "complete",
  "cancel",
  "reschedule",
  "no_show",
  "assign_resource",
  "move_queue_position",
  "collect_payment",
] as const;

export type OperationsWorkflowAction = (typeof OPERATIONS_WORKFLOW_ACTIONS)[number];

export const OPERATIONS_QUEUE_COLUMNS = [
  "appointmentNumber",
  "customerName",
  "phone",
  "service",
  "resource",
  "status",
  "paymentStatus",
  "scheduledAt",
  "waitingMinutes",
  "branch",
] as const;

export type OperationsQueueColumnKey = (typeof OPERATIONS_QUEUE_COLUMNS)[number];
