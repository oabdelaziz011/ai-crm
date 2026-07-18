import { Loader2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RoleFormFields, type RoleFormValues } from "@/components/roles/role-form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PermissionRecord } from "@/hooks/use-rbac";

export type RoleDialogMode = "create" | "edit";

type RoleFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: RoleDialogMode;
  values: RoleFormValues;
  onChange: (values: RoleFormValues) => void;
  permissions: PermissionRecord[];
  permissionsLoading?: boolean;
  submitting?: boolean;
  onSubmit: () => void;
};

export function RoleFormDialog({
  open,
  onOpenChange,
  mode,
  values,
  onChange,
  permissions,
  permissionsLoading,
  submitting,
  onSubmit,
}: RoleFormDialogProps) {
  const { t } = useTranslation("common");
  const title = mode === "create" ? t("forms.roles.create") : t("forms.roles.edit");
  const submitLabel = mode === "create" ? t("roles.createRole") : t("buttons.saveChanges");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden border-white/10 bg-card p-0 text-foreground sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-white/10 px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <RoleFormFields
            values={values}
            onChange={onChange}
            permissions={permissions}
            disabled={submitting}
            permissionsLoading={permissionsLoading}
          />
        </div>

        <DialogFooter className="sticky bottom-0 shrink-0 border-t border-white/10 bg-card/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <Button
            type="button"
            variant="outline"
            className="border-white/10"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("buttons.cancel")}
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={submitting || permissionsLoading || !values.name.trim()}
            className="bg-primary/20 text-primary hover:bg-primary/30"
          >
            {submitting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
            {mode === "create" ? <Plus className="me-2 h-4 w-4" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
