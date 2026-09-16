/**
 * Email workspace ticket labels reuse the existing Ticket i18n keys.
 * Never render raw DB status/priority slugs in the Email UI.
 */
import { localizeTicketActivityStatus } from "@/lib/tickets/ticket360-tab-models";
import { localizeTicketAuditFieldValue } from "@/lib/tickets/ticket360-audit-presentation";

type Translate = (key: string, opts?: Record<string, string>) => string;

export function localizeEmailTicketStatus(status: string, t: Translate): string {
  return localizeTicketActivityStatus(status, t);
}

export function localizeEmailTicketPriority(priority: string, t: Translate): string {
  return localizeTicketAuditFieldValue("priority", priority, t);
}
