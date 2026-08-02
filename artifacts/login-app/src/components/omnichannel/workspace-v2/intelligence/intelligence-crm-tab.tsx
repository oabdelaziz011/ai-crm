import { memo, useMemo } from "react";
import { UserRound } from "lucide-react";
import { useIntelligenceContext } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-context";
import { EnterpriseCard, EnterpriseCardTitle, EnterpriseMetric } from "@/components/omnichannel/workspace-v2/intelligence/enterprise-card";
import { StatusPill } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-ui";
import { BiDirText } from "@/components/omnichannel/presentation/bidir-text";
import { formatSmartTime } from "@/lib/omnichannel/presentation/smart-time";

function formatRevenue(context: ReturnType<typeof useIntelligenceContext>["customerContext"], notAvailable: string): string {
  if (!context?.customer) return notAvailable;
  const est = context.recentBookings * 120 + context.outstandingInvoices * 80;
  if (est <= 0) return notAvailable;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(est);
}

export const IntelligenceCrmTab = memo(function IntelligenceCrmTab() {
  const {
    conversation,
    customerContext,
    viewModel,
    labels,
    smartTimeLabels,
    dir,
    notAvailable,
    onLinkCustomer,
    onCreateCustomer,
  } = useIntelligenceContext();

  const customer = conversation?.customer;
  const crm = labels.crm;
  const isVip = viewModel.v2.healthDashboard.isVip;

  const lastActivity = useMemo(() => {
    if (!conversation?.lastActivityAt) return notAvailable;
    return formatSmartTime(conversation.lastActivityAt, smartTimeLabels).display;
  }, [conversation?.lastActivityAt, notAvailable, smartTimeLabels]);

  const createdDate = useMemo(() => {
    const created = conversation?.source.created_at;
    if (!created) return notAvailable;
    return formatSmartTime(created, smartTimeLabels).exact;
  }, [conversation?.source.created_at, notAvailable, smartTimeLabels]);

  if (!customer?.id) {
    return (
      <div dir={dir}>
        <EnterpriseCard accent="accent" className="text-center">
        <EnterpriseCardTitle icon={<UserRound className="size-3.5 text-[var(--ws-accent)]" />}>
          {crm.notLinkedTitle}
        </EnterpriseCardTitle>
        <p className="mb-3 text-[10px] text-[var(--ws-muted)]">{crm.notLinkedHint}</p>
        <div className="flex flex-col gap-1.5">
          {onLinkCustomer ? (
            <button type="button" className="ws-btn w-full text-[10px]" onClick={onLinkCustomer}>
              {crm.linkCustomer}
            </button>
          ) : null}
          {onCreateCustomer ? (
            <button type="button" className="ws-btn ws-btn--primary w-full text-[10px]" onClick={onCreateCustomer}>
              {crm.createCustomer}
            </button>
          ) : null}
        </div>
        </EnterpriseCard>
      </div>
    );
  }

  return (
    <div dir={dir}>
      <EnterpriseCard>
        <EnterpriseCardTitle icon={<UserRound className="size-3.5 text-[var(--ws-accent)]" />}>
          {crm.title}
        </EnterpriseCardTitle>
      <EnterpriseMetric label={crm.customerName} value={customer.name} />
      <EnterpriseMetric label={crm.company} value={conversation?.channelLabel ?? notAvailable} />
      {customer.phone ? (
        <div className="flex justify-between gap-2 py-1 text-[10px]">
          <span className="text-[var(--ws-muted)]">{crm.phone}</span>
          <BiDirText fieldKind="phone">{customer.phone}</BiDirText>
        </div>
      ) : null}
      {customer.email ? (
        <div className="flex justify-between gap-2 py-1 text-[10px]">
          <span className="text-[var(--ws-muted)]">{crm.email}</span>
          <BiDirText fieldKind="email">{customer.email}</BiDirText>
        </div>
      ) : null}
      <EnterpriseMetric label={crm.status} value={conversation?.status ?? notAvailable} />
      <div className="flex items-center justify-between gap-2 py-1 text-[10px]">
        <span className="text-[var(--ws-muted)]">{crm.vip}</span>
        <StatusPill label={isVip ? crm.yes : crm.no} tone={isVip ? "healthy" : "closed"} />
      </div>
      <EnterpriseMetric label={crm.createdDate} value={createdDate} />
      <EnterpriseMetric label={crm.lastActivity} value={lastActivity} />
      <EnterpriseMetric label={crm.openTickets} value={String(customerContext?.openTickets ?? 0)} />
      <EnterpriseMetric label={crm.totalOrders} value={String(customerContext?.recentBookings ?? 0)} />
      <EnterpriseMetric label={crm.totalRevenue} value={formatRevenue(customerContext, notAvailable)} />
      </EnterpriseCard>
    </div>
  );
});
