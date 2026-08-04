import { useTranslation } from "react-i18next";
import type { OperationsConfigDiffEntry } from "@workspace/universal-operations-engine";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diff: readonly OperationsConfigDiffEntry[] | null;
  title?: string;
};

export function OperationsConfigDiffDialog({ open, onOpenChange, diff, title }: Props) {
  const { t } = useTranslation("common");
  const entries = diff ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title ?? t("universalOperations.configuration.enterprise.diff")}</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2 text-xs">
          {entries.map((entry) => (
            <li key={entry.path} className="rounded border border-border/50 p-2">
              <p className="font-semibold">{entry.path}</p>
              <p className="text-muted-foreground">{t("universalOperations.configuration.enterprise.diffChanged")}</p>
            </li>
          ))}
          {entries.length === 0 && (
            <li className="text-muted-foreground">{t("universalOperations.configuration.enterprise.diffEmpty")}</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
