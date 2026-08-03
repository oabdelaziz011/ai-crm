import type { OperationsCustomerWorkspaceData } from "@workspace/universal-operations-engine";
import { WorkspacePanel } from "@/components/customer-workspace/workspace-ui";
import { useTranslation } from "react-i18next";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/25 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value ?? "—"}</p>
    </div>
  );
}

export function PanelCrmTab({ data }: { data: OperationsCustomerWorkspaceData }) {
  const { t } = useTranslation("common");
  const { customer, lead } = data;

  return (
    <div className="space-y-4">
      <WorkspacePanel title={t("universalOperations.panel.crm.profile")} dense>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={t("universalOperations.panel.crm.email")} value={customer.email} />
          <Field label={t("universalOperations.panel.crm.phone")} value={customer.phone} />
          <Field label={t("universalOperations.panel.crm.company")} value={customer.company} />
          <Field label={t("universalOperations.panel.crm.address")} value={customer.address} />
          <Field label={t("universalOperations.panel.crm.birthday")} value={customer.birthday} />
        </div>
      </WorkspacePanel>

      {lead && (
        <WorkspacePanel title={t("universalOperations.panel.crm.leadOrigin")} dense>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t("universalOperations.panel.crm.leadSource")} value={lead.source} />
            <Field label={t("universalOperations.panel.crm.campaign")} value={lead.campaign} />
            <Field label={t("universalOperations.panel.crm.owner")} value={lead.owner} />
            <Field label={t("universalOperations.panel.crm.leadScore")} value={String(lead.score)} />
            {Object.entries(lead.customFields).map(([key, value]) => (
              <Field key={key} label={key} value={value} />
            ))}
          </div>
        </WorkspacePanel>
      )}
    </div>
  );
}
