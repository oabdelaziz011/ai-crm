import { CompanyBrandCenter } from "@/components/company-workspace/brand-center/company-brand-center";

type Props = {
  onNavigateToOverview?: () => void;
};

/** Brand Center — Enterprise branding source of truth (Company Workspace). */
export function CompanyBrandingTab({ onNavigateToOverview }: Props) {
  return <CompanyBrandCenter onNavigateToOverview={onNavigateToOverview} />;
}
