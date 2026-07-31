import { memo } from "react";
import { DashboardCard } from "@/components/dashboard/ui";
import type { OmnichannelCustomerContext, UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";

type CustomerSidebarProps = {
  conversation: UnifiedConversation | null;
  context: OmnichannelCustomerContext | null;
  profileLabel: string;
  timelineLabel: string;
  bookingsLabel: string;
  invoicesLabel: string;
  ticketsLabel: string;
  knowledgeLabel: string;
  aiActionsLabel: string;
  emptyLabel: string;
};

export const CustomerSidebar = memo(function CustomerSidebar({
  conversation,
  context,
  profileLabel,
  timelineLabel,
  bookingsLabel,
  invoicesLabel,
  ticketsLabel,
  knowledgeLabel,
  aiActionsLabel,
  emptyLabel,
}: CustomerSidebarProps) {
  if (!conversation?.customer) {
    return (
      <DashboardCard className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </DashboardCard>
    );
  }

  const customer = conversation.customer;

  return (
    <DashboardCard className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div>
        <h3 className="text-sm font-semibold">{profileLabel}</h3>
        <p className="mt-2 text-base font-medium">{customer.name}</p>
        {customer.phone ? <p className="text-sm text-muted-foreground">{customer.phone}</p> : null}
        {customer.email ? <p className="text-sm text-muted-foreground">{customer.email}</p> : null}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label={ticketsLabel} value={context?.openTickets ?? 0} />
        <Metric label={bookingsLabel} value={context?.recentBookings ?? 0} />
        <Metric label={invoicesLabel} value={context?.outstandingInvoices ?? 0} />
      </div>

      <Section title={timelineLabel} items={context?.timelinePreview ?? []} />
      <Section title={knowledgeLabel} items={context?.knowledgeSuggestions ?? []} />
      <Section title={aiActionsLabel} items={context?.recentAiActions ?? []} />
    </DashboardCard>
  );
});

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
