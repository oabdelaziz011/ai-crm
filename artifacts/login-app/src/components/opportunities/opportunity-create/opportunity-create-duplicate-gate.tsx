import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

export function OpportunityCreateDuplicateGate({
  opportunityName,
  onCancel,
  onOpenExisting,
  onCreateAnyway,
}: {
  opportunityName: string;
  onCancel: () => void;
  onOpenExisting: () => void;
  onCreateAnyway: () => void;
}) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-4 py-2">
      <p className="text-[13px] text-muted-foreground">
        {t("opportunities.createForm.existingBody", { name: opportunityName })}
      </p>
      <DialogFooter className="gap-2 sm:justify-start">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("buttons.cancel")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCreateAnyway}>
          {t("opportunities.createForm.createAnyway")}
        </Button>
        <Button type="button" onClick={onOpenExisting}>
          {t("opportunities.createForm.openExisting")}
        </Button>
      </DialogFooter>
    </div>
  );
}
