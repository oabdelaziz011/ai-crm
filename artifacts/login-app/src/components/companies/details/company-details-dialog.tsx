import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CompanyDetailsWorkspace } from "@/components/companies/details/company-details-workspace";
import type { CompanyRowActionCapabilities, CompanyRowActionId } from "@/lib/companies/company-row-actions";
import type { Company } from "@/lib/types";

type CompanyDetailsDialogProps = {
  company: Company | null;
  open: boolean;
  capabilities: CompanyRowActionCapabilities;
  onOpenChange: (open: boolean) => void;
  onAction: (id: CompanyRowActionId) => void;
};

export function CompanyDetailsDialog({
  company,
  open,
  capabilities,
  onOpenChange,
  onAction,
}: CompanyDetailsDialogProps) {
  const { t } = useTranslation("common");
  if (!company) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(96vh,920px)] w-[min(calc(100vw-1.5rem),1280px)] max-w-[1280px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">
          {t("companies.details.title")}: {company.name}
        </DialogTitle>
        <CompanyDetailsWorkspace company={company} capabilities={capabilities} onAction={onAction} />
      </DialogContent>
    </Dialog>
  );
}
