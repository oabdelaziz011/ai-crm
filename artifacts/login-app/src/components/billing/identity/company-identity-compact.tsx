import { CompanyLogo } from "@/components/billing/identity/company-logo";
import { CopyCompanyIdButton } from "@/components/billing/identity/copy-company-id-button";

type CompanyIdentityCompactProps = {
  companyId: string;
  name: string;
  logoUrl?: string | null;
  companyType?: string | null;
};

export function CompanyIdentityCompact({
  companyId,
  name,
  logoUrl,
  companyType,
}: CompanyIdentityCompactProps) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <CompanyLogo name={name} logoUrl={logoUrl} />
      <div className="min-w-0">
        <p className="font-medium truncate">{name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {companyType ? <span>{companyType}</span> : null}
          <CopyCompanyIdButton companyId={companyId} />
        </div>
      </div>
    </div>
  );
}
