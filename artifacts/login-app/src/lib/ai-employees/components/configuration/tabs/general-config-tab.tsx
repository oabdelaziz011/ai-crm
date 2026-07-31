import { useTranslation } from "react-i18next";
import {
  AgentConfigTabProps,
  ConfigSection,
  ReadonlyGrid,
  ValidationList,
} from "@/lib/ai-employees/components/configuration/config-tab-shared";

export function GeneralConfigTab({ employee, preview }: AgentConfigTabProps) {
  const { t } = useTranslation("common");

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
