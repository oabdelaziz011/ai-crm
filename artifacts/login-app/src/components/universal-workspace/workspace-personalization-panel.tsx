import { useTranslation } from "react-i18next";
import { personalizationEngine } from "@workspace/universal-workspace-platform";
import { useWorkspacePlatform } from "@/context/workspace-platform-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function WorkspacePersonalizationPanel() {
  const { t } = useTranslation("common");
  const { personalizationOpen, closePersonalization, personalization } = useWorkspacePlatform();

  const updateDensity = (density: "compact" | "comfortable" | "spacious") => {
    personalizationEngine.update("demo_user", { density });
  };

  const updateTheme = (theme: "system" | "light" | "dark") => {
    personalizationEngine.update("demo_user", { theme });
  };

  return (
    <Dialog open={personalizationOpen} onOpenChange={(open) => !open && closePersonalization()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("workspacePlatform.personalization.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t("workspacePlatform.personalization.density")}</Label>
            <Select value={personalization.density} onValueChange={(v) => updateDensity(v as typeof personalization.density)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">{t("workspacePlatform.personalization.densities.compact")}</SelectItem>
                <SelectItem value="comfortable">{t("workspacePlatform.personalization.densities.comfortable")}</SelectItem>
                <SelectItem value="spacious">{t("workspacePlatform.personalization.densities.spacious")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("workspacePlatform.personalization.theme")}</Label>
            <Select value={personalization.theme} onValueChange={(v) => updateTheme(v as typeof personalization.theme)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{t("workspacePlatform.personalization.themes.system")}</SelectItem>
                <SelectItem value="light">{t("workspacePlatform.personalization.themes.light")}</SelectItem>
                <SelectItem value="dark">{t("workspacePlatform.personalization.themes.dark")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs font-semibold">{t("workspacePlatform.personalization.savedFilters")}</p>
            <p className={cn("mt-1 text-xs text-muted-foreground")}>
              {personalization.savedFilters.length === 0
                ? t("workspacePlatform.personalization.noSavedFilters")
                : `${personalization.savedFilters.length} ${t("workspacePlatform.personalization.filtersCount")}`}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
