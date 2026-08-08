import { ArrowLeft, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description: string;
  onBack: () => void;
  children: React.ReactNode;
  addLabel?: string;
  onAdd?: () => void;
  addDisabled?: boolean;
  readOnly?: boolean;
};

export function OperationsConfigScreenShell({
  title,
  description,
  addLabel,
  onBack,
  onAdd,
  addDisabled,
  readOnly,
  children,
}: Props) {
  const { t } = useTranslation("common");
  const showAdd = Boolean(addLabel && onAdd);

  return (
    <div className="space-y-4">
      <Button type="button" variant="ghost" size="sm" className="-ms-2 h-8 px-2 text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="me-1.5 size-3.5" />
        {t("universalOperations.configuration.tasks.backToHome")}
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        {showAdd ? (
          <Button type="button" size="sm" onClick={onAdd} disabled={readOnly || addDisabled}>
            <Plus className="me-1.5 size-3.5" />
            {addLabel}
          </Button>
        ) : null}
      </div>

      {children}
    </div>
  );
}
