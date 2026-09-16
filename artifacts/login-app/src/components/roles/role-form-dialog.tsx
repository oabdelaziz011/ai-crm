import { Loader2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  RoleFormFields,
  RoleIdentityFields,
  type RoleFormValues,
} from "@/components/roles/role-form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PermissionRecord } from "@/hooks/use-rbac";

export type RoleDialogMode = "create" | "edit" | "view";

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
  /** Read-only inspection. Never submits mutations. */
  readOnly?: boolean;
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
  readOnly = false,
}: RoleFormDialogProps) {
  const { t, i18n } = useTranslation("common");
  const isView = readOnly || mode === "view";
  const title = isView
    ? t("forms.roles.view")
    : mode === "create"
      ? t("forms.roles.create")
      : t("forms.roles.edit");
  const submitLabel = mode === "create" ? t("roles.createRole") : t("buttons.saveChanges");
  const direction = (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith("ar") ? "rtl" : "ltr";
  const fieldsDisabled = submitting || isView;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="role-form-dialog"
        data-readonly={isView ? "true" : "false"}
        dir={direction}
        className="flex h-[min(92vh,56rem)] max-h-[92vh] w-[min(96vw,80rem)] max-w-[80rem] flex-col gap-0 overflow-hidden border-border/70 bg-card p-0 text-foreground sm:max-w-[80rem]"
      >
        <DialogHeader className="shrink-0 space-y-4 border-b border-border/70 px-6 py-4 text-start">
          <DialogTitle className="pe-8">{title}</DialogTitle>
          <RoleIdentityFields values={values} onChange={onChange} disabled={fieldsDisabled} />
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-4">
          <RoleFormFields
            values={values}
            onChange={onChange}
            permissions={permissions}
            disabled={fieldsDisabled}
            permissionsLoading={permissionsLoading}
            showIdentityFields={false}
          />
        </div>

        <DialogFooter className="shrink-0 border-t border-border/70 bg-card px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="border-border/70"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {isView ? t("roles.close") : t("buttons.cancel")}
          </Button>
          {isView ? null : (
            <Button
              type="button"
              onClick={onSubmit}
              disabled={submitting || permissionsLoading || !values.name.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {mode === "create" ? <Plus className="me-2 h-4 w-4" /> : null}
              {submitLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
