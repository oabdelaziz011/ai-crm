import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OrganizationDepartment } from "@/lib/organization/types";

type Props = {
  open: boolean;
  onClose: () => void;
  source: OrganizationDepartment | null;
  departments: OrganizationDepartment[];
  isSaving?: boolean;
  onSubmit: (targetId: string) => Promise<void>;
};

export function DepartmentMergeDialog({
  open,
  onClose,
  source,
  departments,
  isSaving,
  onSubmit,
}: Props) {
  const { t } = useTranslation("common");
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTargetId("");
    setError(null);
  }, [open, source?.id]);

  const targets = useMemo(
    () =>
      departments
        .filter((dept) => dept.id !== source?.id)
        .filter((dept) => dept.isActive)
        .filter((dept) => !source || dept.companyId === source.companyId)
        .map((dept) => ({
          value: dept.id,
          label: dept.name,
          description: dept.code ?? undefined,
        })),
    [departments, source],
  );

  const handleSubmit = async () => {
    setError(null);
    if (!targetId) {
      setError(t("companyWorkspace.departments.merge.targetRequired"));
      return;
    }
    try {
      await onSubmit(targetId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("companyWorkspace.departments.merge.failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md border-border/60 bg-card">
        <DialogHeader>
          <DialogTitle>
            {t("companyWorkspace.departments.merge.title", { name: source?.name ?? "" })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("companyWorkspace.departments.merge.description")}
          </p>
          {error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <SearchableSelect
            value={targetId}
            onValueChange={setTargetId}
            options={targets}
            placeholder={t("companyWorkspace.departments.merge.targetPlaceholder")}
            searchPlaceholder={t("companyWorkspace.departments.searchPlaceholder")}
            emptyLabel={t("companyWorkspace.departments.empty")}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("buttons.cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()}>
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              t("companyWorkspace.departments.actions.merge")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
