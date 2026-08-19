import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatCompanyLocation } from "@/components/companies/company-onboarding-wizard";
import { useCompanyEntitlements } from "@/hooks/billing/use-company-entitlements";
import { useCompanyResourceOccupancy } from "@/hooks/billing/use-company-resource-occupancy";
import {
  companyAccessReason,
  companyInternalFlag,
} from "@/lib/companies/company-access-state";
import { occupancyDisplayRow, occupancyRatioLabel } from "@/lib/companies/company-occupancy-display";
import { resolveCompanyApprovalStatus } from "@/lib/companies/company-list-filters";
import {
  visibleCompanyRowActions,
  type CompanyRowActionCapabilities,
  type CompanyRowActionId,
} from "@/lib/companies/company-row-actions";
import { companyPackageDisplaySource } from "@/lib/companies/company-table-query";
import type { Company } from "@/lib/types";
import { cn } from "@/lib/utils";

type CompanyDetailsWorkspaceProps = {
  company: Company;
  capabilities: CompanyRowActionCapabilities;
  onAction: (id: CompanyRowActionId) => void;
};

function billingProfile(company: Company) {
  const profile = company.billing_profile;
  return Array.isArray(profile) ? profile[0] ?? null : profile ?? null;
}

function primaryBranch(company: Company) {
  const branch = company.primary_branch;
  return Array.isArray(branch) ? branch[0] ?? null : branch ?? null;
}

function Field({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p dir={ltr ? "ltr" : undefined} className="mt-0.5 truncate text-sm font-medium text-foreground">
        {value}
      </p>
    </div>
  );
}

export function CompanyDetailsWorkspace({
  company,
  capabilities,
  onAction,
}: CompanyDetailsWorkspaceProps) {
  const { t, i18n } = useTranslation("common");
  const occupancyQuery = useCompanyResourceOccupancy(company.id, true);
  const entitlementsQuery = useCompanyEntitlements(company.id, true);
  const users = occupancyDisplayRow(occupancyQuery.data?.users);
  const branches = occupancyDisplayRow(occupancyQuery.data?.branches);
  const pkg = companyPackageDisplaySource(company);
  const approval = resolveCompanyApprovalStatus(company);
  const flag = companyInternalFlag(company);
  const reason = companyAccessReason(company);
  const billing = billingProfile(company);
  const branch = primaryBranch(company);
  const dash = t("companies.table.dash");
  const unlimited = t("companies.details.unlimited");
  const actions = visibleCompanyRowActions(company, capabilities).filter((action) => action.id !== "view");
  const commercialFeatures = (entitlementsQuery.data ?? []).filter((row) => row.enabled);

  function formatDate(value: string | null | undefined) {
    if (!value) return dash;
    return new Date(value).toLocaleDateString(i18n.language?.startsWith("ar") ? "ar" : "en");
  }

  const packageLabel = pkg.key
    ? t(`companies.packages.${pkg.key}`, { defaultValue: pkg.rawLabel || dash })
    : t("companies.packages.none");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border px-6 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("companies.details.eyebrow")}
        </p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{company.name}</h2>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action.id}
                type="button"
                size="sm"
                variant={
                  action.id === "suspend" || action.id === "reject" || action.id === "delete"
                    ? "destructive"
                    : "outline"
                }
                className="rounded-lg"
                onClick={() => onAction(action.id)}
              >
                {t(`companies.actions.${action.id}`)}
              </Button>
            ))}
          </div>
        </div>
        {flag ? (
          <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <p className="font-semibold">
              {flag === "suspended" ? t("companies.flags.suspended") : t("companies.flags.rejected")}
            </p>
            {reason ? (
              <p className="mt-1 text-destructive/90">
                {t("companies.flags.reason")}: {reason}
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-5">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("companies.details.overview")}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("companies.table.name")} value={company.name} />
            <Field label={t("companies.details.legalName")} value={billing?.legal_name || dash} />
            <Field
              label={t("companies.details.companyType")}
              value={company.business_type || company.company_type || dash}
            />
            <Field
              label={t("companies.details.operationalStatus")}
              value={t(`companies.displayStatus.${company.status === "Trial" ? "trial" : company.status === "Suspended" ? "suspended" : "active"}`)}
            />
            <Field
              label={t("companies.details.approvalStatus")}
              value={t(`companies.approval.status.${approval}`)}
            />
            <Field label={t("companies.table.plan")} value={packageLabel} />
            <Field label={t("companies.details.subscriptionStatus")} value={company.subscription_status || dash} />
            <Field label={t("companies.details.billingCycle")} value={company.billing_cycle || dash} />
            <Field label={t("companies.details.subscriptionExpires")} value={formatDate(company.subscription_expires_at)} />
            <Field label={t("companies.table.created")} value={formatDate(company.created_at)} />
            <Field label={t("companies.table.updated")} value={formatDate(company.updated_at)} />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("companies.details.contact")}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("companies.table.email")} value={company.contact_email || dash} ltr />
            <Field label={t("companies.table.phone")} value={company.contact_phone || dash} ltr />
            <Field label={t("companies.table.owner")} value={company.contact_person || dash} />
            <Field label={t("companies.details.country")} value={branch?.country || dash} />
            <Field label={t("companies.details.city")} value={branch?.city || dash} />
            <Field
              label={t("companies.details.address")}
              value={branch?.address_line1 || billing?.address || formatCompanyLocation(company) || dash}
            />
            <Field label={t("companies.details.taxId")} value={billing?.tax_id || dash} />
            <Field
              label={t("companies.details.registration")}
              value={billing?.commercial_registration || dash}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("companies.details.resources")}</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start">{t("companies.details.resource")}</th>
                  <th className="px-3 py-2 text-start">{t("companies.details.current")}</th>
                  <th className="px-3 py-2 text-start">{t("companies.details.limit")}</th>
                  <th className="px-3 py-2 text-start">{t("companies.details.remaining")}</th>
                  <th className="px-3 py-2 text-start">{t("companies.details.state")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { key: "users", row: users, label: t("companies.details.users") },
                  { key: "branches", row: branches, label: t("companies.details.branches") },
                ].map((item) => (
                  <tr key={item.key}>
                    <td className="px-3 py-2 font-medium">{item.label}</td>
                    <td className="px-3 py-2 tabular-nums">{item.row.used}</td>
                    <td className="px-3 py-2 tabular-nums">{item.row.unlimited ? unlimited : item.row.limit}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {item.row.unlimited ? unlimited : item.row.remaining}
                    </td>
                    <td className={cn("px-3 py-2", item.row.overLimit && "font-semibold text-destructive")}>
                      {item.row.overLimit
                        ? t("companies.details.overLimit")
                        : occupancyRatioLabel(item.row, unlimited)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("companies.details.commercial")}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("companies.table.plan")} value={packageLabel} />
            <Field label={t("companies.details.subscriptionStatus")} value={company.subscription_status || dash} />
            <Field
              label={t("companies.details.trial")}
              value={company.status === "Trial" ? t("companies.details.yes") : t("companies.details.no")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {commercialFeatures.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("companies.details.noCommercialFeatures")}</p>
            ) : (
              commercialFeatures.slice(0, 24).map((row) => (
                <span key={row.feature_code} className="rounded-full border border-border px-2.5 py-1 text-xs">
                  {row.label || row.feature_code}
                </span>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
