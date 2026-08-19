import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { CompanyApprovalWorkspace } from "@/components/companies/approval/company-approval-workspace";
import { useToast } from "@/hooks/use-toast";
import type { Company } from "@/lib/types";

type CompanyApprovalReviewDialogProps = {
  company: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CompanyApprovalReviewDialog({
  company,
  open,
  onOpenChange,
}: CompanyApprovalReviewDialogProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();

  if (!company) return null;

  const pending = (company.approval_status ?? "approved") === "pending";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(96vh,980px)] w-[min(calc(100vw-1.5rem),1600px)] max-w-[1600px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">
          {pending ? t("companies.approval.reviewTitle") : t("companies.approval.viewTitle")}: {company.name}
        </DialogTitle>
        <CompanyApprovalWorkspace
          company={company}
          pending={pending}
          onApproved={() => {
            toast({ title: t("companies.approval.approveSuccess") });
            onOpenChange(false);
          }}
          onRejected={() => {
            toast({ title: t("companies.approval.rejectSuccess") });
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
