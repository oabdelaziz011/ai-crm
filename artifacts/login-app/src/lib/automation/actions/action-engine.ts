import { mapBusinessEventToCreateInput } from "@/lib/notifications/events/notification-event-mapper";
import type { NotificationService } from "@/lib/notifications/services/notification-service";
import type { NotificationChannel, NotificationEvent } from "@/lib/notifications/types";
import type { AutomationAction, AutomationContext } from "@/lib/automation/types";

const ACTION_CHANNEL_MAP: Partial<Record<AutomationAction["type"], NotificationChannel[]>> = {
  send_email: ["email"],
  send_whatsapp: ["whatsapp"],
  internal_notification: ["in_app"],
  create_notification: ["in_app", "email", "whatsapp"],
};

const FUTURE_ACTIONS = new Set<AutomationAction["type"]>(["sms", "push", "webhook", "ai_action"]);

export type ActionExecutionResult = {
  actionType: AutomationAction["type"];
  status: "completed" | "skipped" | "failed";
  notificationCount: number;
  error?: string;
};

function resolveNotificationEvent(action: AutomationAction, context: AutomationContext): NotificationEvent {
  if (action.event) return action.event;
  const mapped = mapBusinessEventToCreateInput(
    { name: context.eventName, companyId: context.companyId, params: context.params, userId: context.userId },
    [],
  );
  return mapped?.event ?? "generic_system";
}

function resolveRecipients(context: AutomationContext) {
  return [
    {
      userId: context.userId ?? null,
      companyId: context.companyId,
    },
  ];
}

/** Executes automation actions exclusively through NotificationService. */
export class ActionEngine {
  constructor(private readonly notificationService: NotificationService) {}

  async executeAll(actions: AutomationAction[], context: AutomationContext): Promise<ActionExecutionResult[]> {
    const results: ActionExecutionResult[] = [];

    for (const action of actions) {
      if (action.enabled === false) {
        results.push({ actionType: action.type, status: "skipped", notificationCount: 0 });
        continue;
      }

      if (FUTURE_ACTIONS.has(action.type)) {
        results.push({ actionType: action.type, status: "skipped", notificationCount: 0 });
        continue;
      }

      try {
        const count = await this.executeOne(action, context);
        results.push({ actionType: action.type, status: "completed", notificationCount: count });
      } catch (error) {
        results.push({
          actionType: action.type,
          status: "failed",
          notificationCount: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  private async executeOne(action: AutomationAction, context: AutomationContext): Promise<number> {
    const channels = action.channels ?? ACTION_CHANNEL_MAP[action.type];
    if (!channels?.length) return 0;

    const event = resolveNotificationEvent(action, context);
    const input = mapBusinessEventToCreateInput(
      {
        name: context.eventName,
        companyId: context.companyId,
        params: { ...context.params, ...(action.params ?? {}) },
        userId: context.userId,
      },
      resolveRecipients(context),
    );

    if (!input) {
      throw new Error(`Unsupported business event for notification: ${context.eventName}`);
    }

    const created = await this.notificationService.createNotification({
      ...input,
      event,
      channels,
      priority: action.priority ?? input.priority,
    });

    return created.length;
  }
}
