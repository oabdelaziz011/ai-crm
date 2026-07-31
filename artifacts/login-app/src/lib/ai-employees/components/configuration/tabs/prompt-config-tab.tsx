import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AgentConfigTabProps,
  ConfigSection,
  ReadonlyGrid,
  ValidationList,
} from "@/lib/ai-employees/components/configuration/config-tab-shared";

export function PromptConfigTab({ employee, preview, canEdit, isSaving, onSave }: AgentConfigTabProps) {
  const { t } = useTranslation("common");
  const [systemPrompt, setSystemPrompt] = useState(employee.systemPrompt);
  const [versionLabel, setVersionLabel] = useState(employee.promptVersionLabel);

  useEffect(() => {
    setSystemPrompt(employee.systemPrompt);
    setVersionLabel(employee.promptVersionLabel);
  }, [employee.promptVersionLabel, employee.systemPrompt]);

  const handleSave = () => {
    onSave({
      systemPrompt,
      promptVersionLabel: versionLabel.trim() || "v1",
    });
  };

  return (
    <div className="space-y-6">
      <ConfigSection title={t("aiEmployees.config.sections.prompt")}>
        {canEdit ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prompt-version">{t("aiEmployees.config.fields.promptVersion")}</Label>
              <Input
                id="prompt-version"
                value={versionLabel}
                onChange={(event) => setVersionLabel(event.target.value)}
                className="max-w-xs rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="system-prompt">{t("aiEmployees.form.systemPrompt")}</Label>
              <Textarea
                id="system-prompt"
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                rows={10}
                className="rounded-xl"
              />
            </div>
            <Button className="rounded-xl" disabled={isSaving} onClick={handleSave}>
              {t("aiEmployees.save")}
            </Button>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {employee.systemPrompt || t("aiEmployees.detail.noPrompt")}
          </p>
        )}
      </ConfigSection>
      <ConfigSection title={t("aiEmployees.config.sections.promptMetrics")}>
        <ReadonlyGrid
          rows={[
            { label: t("aiEmployees.config.fields.promptVersion"), value: preview?.prompt.versionLabel },
            { label: t("aiEmployees.config.fields.estimatedTokens"), value: preview?.prompt.estimatedTokens },
            {
              label: t("aiEmployees.config.fields.variables"),
              value: preview?.prompt.variables.length ? preview.prompt.variables.join(", ") : "—",
            },
          ]}
        />
      </ConfigSection>
      <ValidationList preview={preview} />
    </div>
  );
}
