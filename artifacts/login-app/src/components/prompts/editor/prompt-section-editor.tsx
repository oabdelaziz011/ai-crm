import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import type { PromptSectionConfig, PromptSectionKey } from "@workspace/ai-prompt-orchestrator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

type Props = {
  sections: Partial<Record<PromptSectionKey, PromptSectionConfig>>;
  sectionOrder: PromptSectionKey[];
  onChange: (sections: Partial<Record<PromptSectionKey, PromptSectionConfig>>) => void;
};

export function PromptSectionEditor({ sections, sectionOrder, onChange }: Props) {
  const { t } = useTranslation("common");

  function updateSection(key: PromptSectionKey, patch: Partial<PromptSectionConfig>) {
    onChange({
      ...sections,
      [key]: {
        enabled: true,
        ...sections[key],
        ...patch,
      },
    });
  }

  return (
    <div className="space-y-4">
      {sectionOrder.map((key) => {
        const section = sections[key] ?? { enabled: true, content: "" };
        return (
          <div key={key} className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="font-medium">{key}</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("prompts.editor.enabled")}</span>
                <Switch
                  checked={section.enabled !== false}
                  onCheckedChange={(enabled) => updateSection(key, { enabled })}
                />
              </div>
            </div>
            <Textarea
              value={section.content ?? ""}
              onChange={(event) => updateSection(key, { content: event.target.value })}
              rows={5}
              placeholder={t("prompts.editor.sectionPlaceholder")}
            />
          </div>
        );
      })}
    </div>
  );
}
