import { lazy, memo, Suspense, useMemo, useState } from "react";
import { ChevronDown, Sparkles, X } from "lucide-react";
import { DeskEmptyState } from "@/components/omnichannel/agent-desk/desk-empty-state";
import type {
  OmnichannelAiAssistModel,
  OmnichannelCustomerContext,
  UnifiedConversation,
  UnifiedMessage,
} from "@/lib/omnichannel/types/unified-conversation";
import type { LifecycleSnapshot } from "@/lib/conversation-lifecycle";
import type { OperationalEscalationRecord } from "@/lib/conversation-lifecycle";
import type { AgentDeskLabels, WorkspaceSidebarLabels } from "@/components/omnichannel/types/workspace-labels";

const CustomerProfileDrawer = lazy(() =>
  import("@/components/customer-profile/customer-profile-drawer").then((m) => ({
    default: m.CustomerProfileDrawer,
  })),
);

type InsightPanelProps = {
  open: boolean;
  onClose: () => void;
  conversation: UnifiedConversation | null;
  messages: UnifiedMessage[];
  context: OmnichannelCustomerContext | null;
  aiAssist: OmnichannelAiAssistModel;
  lifecycleSnapshot?: LifecycleSnapshot | null;
  escalations: OperationalEscalationRecord[];
  labels: WorkspaceSidebarLabels;
  deskLabels: AgentDeskLabels;
  companyId?: string | null;
  onReturnEscalation: () => void;
  onOpenAssignment?: () => void;
  onLinkCustomer?: () => void;
  onCreateCustomer?: () => void;
};

function formatLtv(context: OmnichannelCustomerContext | null, notAvailable: string): string {
  if (!context?.customer) return notAvailable;
  const est = context.recentBookings * 120 + context.outstandingInvoices * 80;
  if (est <= 0) return notAvailable;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(est);
}

export const InsightPanel = memo(function InsightPanel({
  open,
  onClose,
  conversation,
  messages,
  context,
  aiAssist,
  lifecycleSnapshot,
  escalations,
  labels,
  deskLabels,
  companyId,
  onReturnEscalation,
  onOpenAssignment,
  onLinkCustomer,
  onCreateCustomer,
}: InsightPanelProps) {
  const [profileOpen, setProfileOpen] = useState(false);

  const notes = useMemo(() => messages.filter((m) => m.isInternalNote), [messages]);
  const timeline = useMemo(
    () => lifecycleSnapshot?.timeline.map((e) => e.summary) ?? context?.timelinePreview ?? [],
    [lifecycleSnapshot, context],
  );
  const recentActivity = context?.recentAiActions ?? [];

  const customer = conversation?.customer;

  return (
    <>
      {open ? (
        <button
          type="button"
          className="absolute inset-0 z-30 bg-black/10 lg:bg-black/5"
          aria-label={deskLabels.closeCustomer360}
          onClick={onClose}
        />
      ) : null}

      <aside
        aria-label={deskLabels.customer360}
        aria-hidden={!open}
        className={`agent-desk-insight-panel absolute inset-y-0 end-0 z-40 flex max-w-[22rem] flex-col border-s border-[var(--ad-border)] bg-[#0a0e13]/97 shadow-2xl backdrop-blur-sm ${
          open ? "agent-desk-insight-panel--open pointer-events-auto" : "pointer-events-none"
        }`}
        style={{ width: "var(--ad-insight-max)" }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--ad-border-subtle)] px-3 py-2.5">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-[var(--ad-violet)]">{deskLabels.customer360}</p>
            <h2 className="truncate text-sm font-semibold">{customer?.name ?? labels.overview}</h2>
          </div>
          <button type="button" className="agent-desk-btn agent-desk-btn--ghost p-1.5" onClick={onClose} aria-label={deskLabels.close}>
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs">
          {!customer?.id ? (
            <DeskEmptyState
              variant="insight"
              title={labels.empty}
              description={deskLabels.insightEmptyHint}
              actionLabel={labels.linkCustomer}
              onAction={onLinkCustomer}
              secondaryActionLabel={deskLabels.emptySecondary.insight}
              onSecondaryAction={onCreateCustomer}
            />
          ) : (
            <div className="space-y-2">
              <InsightSection title={labels.overview} defaultOpen>
                <div className="space-y-1 rounded-lg border border-[var(--ad-border-subtle)] bg-[var(--ad-surface)] p-2.5">
                  <p className="font-medium">{customer.name}</p>
                  {customer.phone ? <p dir="ltr" className="text-[var(--ad-text-muted)]">{customer.phone}</p> : null}
                  {customer.email ? <p className="truncate text-[var(--ad-text-muted)]">{customer.email}</p> : null}
                  <MetricRow label={labels.lifetimeValue} value={formatLtv(context, deskLabels.notAvailable)} />
                </div>
                <button type="button" className="mt-1 text-[var(--ad-accent)] hover:underline" onClick={() => setProfileOpen(true)}>
                  {labels.crmTabs.customer}
                </button>
              </InsightSection>

              <InsightSection title={labels.crmTabs.orders} defaultOpen>
                <MetricCard value={String(context?.recentBookings ?? 0)} />
              </InsightSection>

              <InsightSection title={labels.bookings}>
                <MetricCard value={String(context?.recentBookings ?? 0)} />
              </InsightSection>

              <InsightSection title={labels.crmTabs.invoices}>
                <MetricCard value={String(context?.outstandingInvoices ?? 0)} />
              </InsightSection>

              <InsightSection title={labels.crmTabs.tickets}>
                <MetricCard value={String(context?.openTickets ?? 0)} />
                {onOpenAssignment ? (
                  <button type="button" className="agent-desk-btn mt-2 w-full text-[10px]" onClick={onOpenAssignment}>
                    {labels.assignTo}
                  </button>
                ) : null}
              </InsightSection>

              <InsightSection title={labels.aiSummary} defaultOpen>
                <div className="rounded-lg border border-violet-500/15 bg-violet-950/25 p-2.5">
                  <p className="mb-1 flex items-center gap-1 text-[10px] text-[var(--ad-violet)]">
                    <Sparkles className="size-3" /> {labels.aiSummary}
                  </p>
                  <p className="leading-relaxed text-[var(--ad-text-muted)]">{aiAssist.summary}</p>
                  <div className="mt-2 space-y-1 border-t border-violet-500/10 pt-2 text-[10px]">
                    <MetricRow label={labels.intent} value={aiAssist.intent} />
                    <MetricRow label={labels.sentiment} value={aiAssist.sentiment} />
                    <MetricRow label={labels.currentOwner} value={lifecycleSnapshot?.owner.label ?? deskLabels.notAvailable} />
                  </div>
                </div>
              </InsightSection>

              <InsightSection title={labels.recentActivity}>
                {recentActivity.length === 0 ? (
                  <p className="text-[10px] text-[var(--ad-text-muted)]">{labels.empty}</p>
                ) : (
                  <ul className="space-y-1">
                    {recentActivity.map((item, i) => (
                      <li key={`${item}-${i}`} className="rounded border border-[var(--ad-border-subtle)] px-2 py-1 text-[10px]">{item}</li>
                    ))}
                  </ul>
                )}
              </InsightSection>

              <InsightSection title={labels.timeline}>
                {timeline.length === 0 ? (
                  <p className="text-[10px] text-[var(--ad-text-muted)]">{labels.empty}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {timeline.map((item, i) => (
                      <li key={`${item}-${i}`} className="border-s-2 border-[var(--ad-border)] ps-2 text-[10px] text-[var(--ad-text-muted)]">{item}</li>
                    ))}
                  </ul>
                )}
                {escalations.length > 0 ? (
                  <button type="button" className="mt-2 text-[var(--ad-accent)] hover:underline" onClick={onReturnEscalation}>
                    {labels.returnConversation}
                  </button>
                ) : null}
              </InsightSection>

              <InsightSection title={labels.internalNotes}>
                {notes.length === 0 ? (
                  <p className="text-[10px] text-[var(--ad-text-muted)]">{labels.empty}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {notes.map((note) => (
                      <li key={note.id} className="rounded-md border border-amber-500/20 bg-amber-950/10 p-2 text-[10px]">{note.body}</li>
                    ))}
                  </ul>
                )}
              </InsightSection>
            </div>
          )}
        </div>
      </aside>

      {customer?.id ? (
        <Suspense fallback={null}>
          <CustomerProfileDrawer
            open={profileOpen}
            onClose={() => setProfileOpen(false)}
            customerId={customer.id}
            context={{
              conversationId: conversation?.id ?? null,
              companyId: companyId ?? null,
            }}
            backToConversationLabel={deskLabels.backToConversation}
          />
        </Suspense>
      ) : null}
    </>
  );
});

function InsightSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="agent-desk-collapse rounded-lg border border-[var(--ad-border-subtle)] bg-[var(--ad-surface)]/50" open={defaultOpen}>
      <summary className="flex items-center justify-between px-2.5 py-2 text-[11px] font-medium">
        {title}
        <ChevronDown className="agent-desk-collapse-chevron size-3.5 text-[var(--ad-text-muted)]" />
      </summary>
      <div className="border-t border-[var(--ad-border-subtle)] px-2.5 pb-2.5 pt-2">{children}</div>
    </details>
  );
}

function MetricCard({ value }: { value: string }) {
  return (
    <div className="rounded-md bg-[var(--ad-surface-raised)] px-3 py-2 text-lg font-semibold tabular-nums">{value}</div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-[10px]">
      <span className="text-[var(--ad-text-muted)]">{label}</span>
      <span className="capitalize text-[var(--ad-text)]">{value}</span>
    </div>
  );
}
