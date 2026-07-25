import { useTranslation } from "react-i18next";
import type { CustomerProfileContext } from "@/components/customer-profile/types";
import type { Customer } from "@/lib/types";

type Props = {
  customer: Customer;
  context?: CustomerProfileContext;
};

export function SystemTab({ customer, context }: Props) {
  const { t } = useTranslation("common");
  const showConversationId = context?.conversationNumber ?? context?.conversationId;

  const rows = [
    showConversationId
      ? {
          label: t("dashboard.customerDetails.fields.conversationId"),
          value: showConversationId,
        }
      : null,
    {
      label: t("dashboard.customerDetails.fields.customerId"),
      value: customer.id,
    },
    context?.companyId
      ? {
          label: t("dashboard.customerDetails.fields.companyId"),
          value: context.companyId,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div className="rounded-lg border border-white/10 bg-background/15 divide-y divide-white/5 text-xs font-mono">
      {rows.map((row) => (
        <div key={row.label} className="px-3 py-2.5 flex justify-between gap-3">
          <span className="text-muted-foreground shrink-0">{row.label}</span>
          <span className="text-right break-all">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
