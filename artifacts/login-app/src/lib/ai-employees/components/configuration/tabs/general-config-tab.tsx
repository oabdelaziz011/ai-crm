import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AgentConfigTabProps,
  ConfigSection,
  ReadonlyGrid,
  ValidationList,
} from "@/lib/ai-employees/components/configuration/config-tab-shared";
import { resolveAiEmployeeWelcomeMessage } from "@/lib/ai-employees/utilities/resolve-ai-employee-welcome-message";

export function GeneralConfigTab({ employee, preview, canEdit, isSaving, onSave }: AgentConfigTabProps) {
  const { t } = useTranslation("common");
  const [welcomeMessage, setWelcomeMessage] = useState(employee.welcomeMessage);

  useEffect(() => {
    setWelcomeMessage(employee.welcomeMessage);
  }, [employee.welcomeMessage]);

  const handleSaveWelcome = () => {
    onSave({ welcomeMessage });
  };

  return (
    <div className="space-y-6">
      <ConfigSection title={t("aiEmployees.config.sections.profile")}>
        <ReadonlyGrid
          rows={[
            { label: t("aiEmployees.form.displayName"), value: employee.displayName },
            { label: t("aiEmployees.form.internalName"), value: employee.name },
            { label: t("aiEmployees.form.department"), value: employee.department },
            { label: t("aiEmployees.form.owner"), value: employee.owner },
            { label: t("aiEmployees.form.status"), value: t(`aiEmployees.status.${employee.status}`) },
          ]}
        />
      </ConfigSection>
      <ConfigSection title={t("aiEmployees.config.sections.conversation")}>
        {canEdit ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="employee-welcome-message">{t("aiEmployees.form.welcomeMessage")}</Label>
              <Textarea
                id="employee-welcome-message"
                value={welcomeMessage}
                onChange={(event) => setWelcomeMessage(event.target.value)}
                placeholder={t("aiEmployees.form.welcomeMessagePlaceholder")}
                rows={5}
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">{t("aiEmployees.form.welcomeMessageHint")}</p>
            </div>
            <Button className="rounded-xl" disabled={isSaving} onClick={handleSaveWelcome}>
              {t("aiEmployees.save")}
            </Button>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {resolveAiEmployeeWelcomeMessage(employee.welcomeMessage)}
          </p>
        )}
      </ConfigSection>
      <ConfigSection title={t("aiEmployees.config.sections.readiness")}>
        <ReadonlyGrid
          rows={[
            { label: t("aiEmployees.config.ready"), value: preview?.ready ?? false },
            {
              label: t("aiEmployees.config.sections.missing"),
              value: preview?.missing.length ? preview.missing.join(", ") : "—",
            },
          ]}
        />
        <ValidationList preview={preview} />
      </ConfigSection>
    </div>
  );
}
