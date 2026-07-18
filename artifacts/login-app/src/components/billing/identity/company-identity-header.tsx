import { useTranslation } from "react-i18next";
import { CompanyLogo } from "@/components/billing/identity/company-logo";
import { CopyCompanyIdButton } from "@/components/billing/identity/copy-company-id-button";
import type { BillingContact } from "@/lib/billing/types";

type CompanyIdentityHeaderProps = {
  companyId: string;
  name: string;
  logoUrl?: string | null;
  companyType?: string | null;
  billingContact?: BillingContact | null;
};

export function CompanyIdentityHeader({
  companyId,
  name,
  logoUrl,
  companyType,
  billingContact,
}: CompanyIdentityHeaderProps) {
  const { t } = useTranslation("common");

  return (
    <div className="rounded-2xl border border-white/5 bg-card/30 p-5 backdrop-blur-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <CompanyLogo name={name} logoUrl={logoUrl} className="h-16 w-16" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{companyType ?? t("billing.detail.companyTypeDefault")}</span>
              <span>·</span>
              <CopyCompanyIdButton companyId={companyId} />
            </div>
          </div>
        </div>

        {billingContact ? (
          <div className="rounded-xl border border-white/5 bg-background/40 p-4 text-sm min-w-[260px]">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {t("billing.detail.billingContact")}
            </p>
            <p className="font-medium">{billingContact.name}</p>
            <p className="text-muted-foreground">{billingContact.email}</p>
            {billingContact.phone ? <p className="text-muted-foreground">{billingContact.phone}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
