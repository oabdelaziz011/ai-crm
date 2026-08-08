import { useTranslation } from "react-i18next";
import type { Customer360SectionId } from "@workspace/universal-operations-engine";
import { Customer360Sections } from "@/components/universal-operations/customer360/customer360-sections";
import { Customer360Content } from "@/components/universal-operations/customer360/customer360-content";
import type { OperationWidgetContext, OperationWidgetDefinition } from "@/lib/universal-operations/widget-registry/types";
import { ComingSoonBanner, MetaRow, WidgetCard } from "./shared";
import { fmtMoney } from "@/components/universal-operations/customer360/customer360-ui";

function SectionWidget({
  sectionId,
  ctx,
}: {
  sectionId: Customer360SectionId;
  ctx: OperationWidgetContext;
}) {
  if (!ctx.customer360) {
    return <ComingSoonBanner label="—" />;
  }
  return (
    <Customer360Sections
      data={ctx.customer360}
      sectionId={sectionId}
      collapsed={false}
    />
  );
}

export const sectionWidgets: OperationWidgetDefinition[] = [
  {
    id: "history.timeline",
    module: "history",
    titleKey: "universalOperations.workspace.widgets.timeline",
    order: 10,
    tabs: ["timeline", "history"],
    visible: (ctx) => Boolean(ctx.customer360),
    Component: ({ ctx }) => <SectionWidget sectionId="timeline" ctx={ctx} />,
  },
  {
    id: "crm.customer360",
    module: "crm",
    titleKey: "universalOperations.workspace.widgets.customer",
    order: 10,
    tabs: ["customer"],
    visible: () => true,
    Component: ({ ctx }) => (
      <Customer360Content
        row={ctx.row}
        templateKey={ctx.templateKey}
        embedded
        showHeader={false}
        showQuickActions={false}
        sectionIds={["customer_summary", "communication", "bookings", "tasks"]}
        className="min-h-0"
      />
    ),
  },
  {
    id: "billing.payments",
    module: "billing",
    titleKey: "universalOperations.workspace.widgets.payments",
    order: 10,
    tabs: ["payments"],
    visible: (ctx) => Boolean(ctx.customer360),
    Component: ({ ctx }) => <SectionWidget sectionId="invoices_payments" ctx={ctx} />,
  },
  {
    id: "billing.outstanding",
    module: "billing",
    titleKey: "universalOperations.workspace.widgets.outstanding",
    order: 5,
    tabs: ["payments"],
    visible: (ctx) => Boolean(ctx.customer360),
    Component: ({ ctx }) => {
      const { t } = useTranslation("common");
      const data = ctx.customer360!;
      const paid = data.payments.reduce((sum, p) => sum + p.amountCents, 0);
      return (
        <WidgetCard title={t("universalOperations.workspace.widgets.paymentSummary")}>
          <MetaRow label={t("universalOperations.workspace.widgets.outstanding")} value={fmtMoney(data.outstandingBalanceCents)} />
          <MetaRow label={t("universalOperations.workspace.widgets.paid")} value={fmtMoney(paid)} />
          <MetaRow label={t("universalOperations.workspace.widgets.invoices")} value={data.invoices.length} />
          <MetaRow label={t("universalOperations.workspace.widgets.receipts")} value={data.payments.length} />
          <MetaRow label={t("universalOperations.workspace.widgets.refunds")} value={t("universalOperations.workspace.comingSoon")} />
        </WidgetCard>
      );
    },
  },
  {
    id: "history.notes",
    module: "history",
    titleKey: "universalOperations.workspace.widgets.notes",
    order: 10,
    tabs: ["notes"],
    visible: (ctx) => Boolean(ctx.customer360),
    Component: ({ ctx }) => <SectionWidget sectionId="notes" ctx={ctx} />,
  },
  {
    id: "history.files",
    module: "history",
    titleKey: "universalOperations.workspace.widgets.files",
    order: 10,
    tabs: ["files"],
    visible: (ctx) => Boolean(ctx.customer360),
    Component: ({ ctx }) => <SectionWidget sectionId="files" ctx={ctx} />,
  },
  {
    id: "ai.assistant",
    module: "ai",
    titleKey: "universalOperations.workspace.widgets.ai",
    order: 10,
    tabs: ["ai"],
    visible: (ctx) => Boolean(ctx.customer360),
    Component: ({ ctx }) => <SectionWidget sectionId="ai_assistant" ctx={ctx} />,
  },
  {
    id: "ai.suggested_actions",
    module: "ai",
    titleKey: "universalOperations.workspace.widgets.suggestedActions",
    order: 20,
    tabs: ["ai"],
    comingSoon: true,
    visible: () => true,
    Component: () => {
      const { t } = useTranslation("common");
      return (
        <WidgetCard title={t("universalOperations.workspace.widgets.suggestedActions")}>
          <ComingSoonBanner label={t("universalOperations.workspace.comingSoon")} />
        </WidgetCard>
      );
    },
  },
  {
    id: "related.records",
    module: "related",
    titleKey: "universalOperations.workspace.widgets.related",
    order: 10,
    tabs: ["related"],
    visible: () => true,
    Component: ({ ctx }) => {
      const { t } = useTranslation("common");
      const links = [
        { key: "appointment", label: t("universalOperations.workspace.related.appointment"), value: ctx.row.id },
        { key: "customer", label: t("universalOperations.workspace.related.customer"), value: ctx.row.customerId ?? "—" },
        { key: "lead", label: t("universalOperations.workspace.related.lead"), value: ctx.row.leadId ?? t("universalOperations.workspace.comingSoon") },
        { key: "invoice", label: t("universalOperations.workspace.related.invoice"), value: ctx.customer360?.invoices[0]?.number ?? t("universalOperations.workspace.comingSoon") },
        { key: "conversation", label: t("universalOperations.workspace.related.conversation"), value: t("universalOperations.workspace.comingSoon") },
        { key: "project", label: t("universalOperations.workspace.related.project"), value: t("universalOperations.workspace.comingSoon") },
        { key: "ticket", label: t("universalOperations.workspace.related.ticket"), value: t("universalOperations.workspace.comingSoon") },
      ];
      return (
        <WidgetCard title={t("universalOperations.workspace.widgets.related")}>
          <div className="space-y-1">
            {links.map((link) => (
              <MetaRow key={link.key} label={link.label} value={link.value} />
            ))}
          </div>
        </WidgetCard>
      );
    },
  },
];
