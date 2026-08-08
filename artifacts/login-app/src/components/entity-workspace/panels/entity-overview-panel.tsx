import { memo } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useEntityWorkspace } from "@/context/entity-workspace-context";
import { formatOperationsQueueMoney } from "@/lib/i18n/operations-queue-labels";

export const EntityOverviewPanel = memo(function EntityOverviewPanel() {
  const { t } = useTranslation("common");
  const { customer, operation, customFields, tags } = useEntityWorkspace();

  const amountCents = Number(operation?.values.amount) || 0;
  const currency = String(operation?.values.currency ?? "USD");
  const fields: Array<{ label: string; value: string }> = [];

  if (customer?.name) fields.push({ label: t("forms.customer.name"), value: customer.name });
  if (customer?.phone) fields.push({ label: t("forms.customer.phone"), value: customer.phone });
  if (customer?.email) fields.push({ label: t("forms.customer.email"), value: customer.email });

  const service = String(operation?.values.service ?? "").trim();
  const resource = String(operation?.values.resource ?? "").trim();
  const visitType = String(operation?.values.visit_type ?? "").trim();
  const paymentStatus = String(operation?.values.payment_status ?? "").trim();
  const status = String(operation?.values.status ?? operation?.statusId ?? "").trim();
  const branch = String(operation?.values.branch ?? "").trim();

  if (service && service !== "—") fields.push({ label: t("entityWorkspace.panels.currentOperation"), value: service });
  if (resource && resource !== "—") fields.push({ label: t("entityWorkspace.panels.assignedResource"), value: resource });
  if (visitType && visitType !== "—") fields.push({ label: t("entityWorkspace.overview.visitType"), value: visitType });
  if (amountCents > 0) {
    fields.push({
      label: t("entityWorkspace.overview.amount"),
      value: formatOperationsQueueMoney(t, amountCents, currency),
    });
  }
  if (paymentStatus) fields.push({ label: t("entityWorkspace.overview.paymentStatus"), value: paymentStatus });
  if (status) fields.push({ label: t("entityWorkspace.panels.operationStatus"), value: status });
  if (branch && branch !== "—") fields.push({ label: t("entityWorkspace.header.branch"), value: branch });
  if (customer?.created_at) {
    fields.push({
      label: t("entityWorkspace.overview.createdDate"),
      value: format(new Date(customer.created_at), "MMM d, yyyy"),
    });
  }
  if (customer?.updated_at) {
    fields.push({
      label: t("entityWorkspace.overview.lastUpdated"),
      value: format(new Date(customer.updated_at), "MMM d, yyyy HH:mm"),
    });
  }
  for (const field of customFields) {
    if (field.value?.trim()) fields.push({ label: field.label, value: field.value });
  }

  if (fields.length === 0 && tags.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold tracking-tight">{t("entityWorkspace.panels.overview")}</h3>
      {fields.length > 0 ? (
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={`${field.label}-${field.value}`} className="rounded-xl bg-muted/30 px-3 py-2.5">
              <dt className="text-[11px] text-muted-foreground">{field.label}</dt>
              <dd className="mt-0.5 truncate text-sm font-medium">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs font-medium"
            >
              {tag.name}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
});
