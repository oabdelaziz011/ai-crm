import { memo } from "react";
import { Link2, UserPlus } from "lucide-react";
import type { ConversationHeader } from "@/lib/conversation-lifecycle/types/lifecycle-types";
import {
  formatPriorityLabel,
  resolveContactDisplayName,
  shouldHideMetaValue,
} from "@/lib/omnichannel/presentation/contact-display";

type SessionIdentityStripProps = {
  header: ConversationHeader;
  conversationId?: string | null;
  languageLabel?: string;
  escalated?: boolean;
  canLinkCustomer?: boolean;
  canCreateCustomer?: boolean;
  channelLabel: string;
  lifecycleLabel: string;
  visitorLabel: string;
  labels: {
    createCustomer: string;
    linkCustomer: string;
    unassigned: string;
    assignedTo: string;
    queue: string;
    priority: string;
    sla: string;
    status: string;
    language: string;
    escalated: string;
  };
  priorityLabel: (key: string) => string;
  onCreateCustomer?: () => void;
  onLinkCustomer?: () => void;
  onOpenCustomer360?: () => void;
  openCustomer360Label?: string;
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function Meta({ label, value, tone }: { label: string; value: string; tone?: "warn" | "success" | "danger" }) {
  const toneClass =
    tone === "warn" ? "text-[var(--ad-warn)]" : tone === "success" ? "text-[var(--ad-success)]" : tone === "danger" ? "text-[var(--ad-danger)]" : "text-[var(--ad-text)]";
  return (
    <div className="min-w-0">
      <dt className="text-[8px] uppercase tracking-wide text-[var(--ad-text-muted)]">{label}</dt>
      <dd className={`truncate text-[11px] ${toneClass}`}>{value}</dd>
    </div>
  );
}

export const SessionIdentityStrip = memo(function SessionIdentityStrip({
  header,
  conversationId,
  languageLabel,
  escalated,
  canLinkCustomer,
  canCreateCustomer,
  channelLabel,
  lifecycleLabel,
  visitorLabel,
  labels,
  priorityLabel,
  onCreateCustomer,
  onLinkCustomer,
  onOpenCustomer360,
  openCustomer360Label,
}: SessionIdentityStripProps) {
  const displayName = resolveContactDisplayName({
    name: header.customer.name,
    phone: header.customer.phone,
    email: header.customer.email,
    conversationId,
    visitorLabel,
  });
  const hasCustomer = Boolean(header.customer.id);
  const isResolved = header.lifecycleState === "RESOLVED" || header.lifecycleState === "CLOSED";
  const assignedName = header.assignedUser?.name?.trim();
  const queueValue = header.queueLabel?.trim() || header.queueId?.trim();
  const slaValue = header.sla.label?.trim();
  const priority = formatPriorityLabel(header.priority, priorityLabel);

  const metaItems: Array<{ key: string; label: string; value: string; tone?: "warn" | "success" | "danger" }> = [];

  if (assignedName && !shouldHideMetaValue(assignedName)) {
    metaItems.push({ key: "assigned", label: labels.assignedTo, value: assignedName });
  }
  if (queueValue && !shouldHideMetaValue(queueValue)) {
    metaItems.push({ key: "queue", label: labels.queue, value: queueValue });
  }
  if (slaValue && !shouldHideMetaValue(slaValue)) {
    metaItems.push({
      key: "sla",
      label: labels.sla,
      value: slaValue,
      tone: header.sla.breached ? "danger" : undefined,
    });
  }
  if (priority) {
    metaItems.push({
      key: "priority",
      label: labels.priority,
      value: priority,
      tone: header.priority === "urgent" ? "warn" : undefined,
    });
  }
  metaItems.push({
    key: "status",
    label: labels.status,
    value: lifecycleLabel,
    tone: isResolved ? "success" : escalated ? "warn" : undefined,
  });
  if (languageLabel?.trim()) {
    metaItems.push({ key: "language", label: labels.language, value: languageLabel });
  }

  return (
    <div className="shrink-0 border-b border-[var(--ad-border-subtle)] bg-[var(--ad-surface)] px-2 py-1 sm:px-3">
      <div className="flex items-center gap-2.5">
        {onOpenCustomer360 ? (
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ad-surface-raised)] text-[10px] font-bold ring-1 ring-[var(--ad-border-subtle)] transition-colors hover:ring-[var(--ad-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ad-accent)]"
            onClick={onOpenCustomer360}
            aria-label={openCustomer360Label}
          >
            {initials(displayName)}
          </button>
        ) : (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ad-surface-raised)] text-[10px] font-bold ring-1 ring-[var(--ad-border-subtle)]">
            {initials(displayName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-semibold">{displayName}</span>
            {header.customer.phone ? (
              <span className="text-[11px] text-[var(--ad-text-muted)]" dir="ltr">{header.customer.phone}</span>
            ) : null}
            <span className="rounded bg-[var(--ad-surface-raised)] px-1.5 py-0.5 text-[9px] uppercase text-[var(--ad-text-muted)]">
              {channelLabel}
            </span>
            {escalated ? <span className="text-[9px] font-medium text-[var(--ad-warn)]">{labels.escalated}</span> : null}
          </div>
        </div>
        {!hasCustomer && (canLinkCustomer || canCreateCustomer) ? (
          <div className="flex shrink-0 gap-1">
            {canLinkCustomer ? (
              <button type="button" className="agent-desk-btn agent-desk-btn--ghost px-2 py-1 text-[10px]" onClick={onLinkCustomer}>
                <Link2 className="size-3" />
                {labels.linkCustomer}
              </button>
            ) : null}
            {canCreateCustomer ? (
              <button type="button" className="agent-desk-btn px-2 py-1 text-[10px]" onClick={onCreateCustomer}>
                <UserPlus className="size-3" />
                {labels.createCustomer}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {metaItems.length > 0 ? (
        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3 lg:grid-cols-6">
          {metaItems.map((item) => (
            <Meta key={item.key} label={item.label} value={item.value} tone={item.tone} />
          ))}
        </dl>
      ) : null}
    </div>
  );
});
