import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AgentConfigTabProps,
  ConfigSection,
  ReadonlyGrid,
  ValidationList,
} from "@/lib/ai-employees/components/configuration/config-tab-shared";

export function LimitsConfigTab({ employee, preview, canEdit, isSaving, onSave }: AgentConfigTabProps) {
  const { t } = useTranslation("common");
  const limits = preview?.limits ?? employee.runtimeConfiguration;

  const [temperature, setTemperature] = useState(String(employee.temperature ?? ""));
  const [maxTokens, setMaxTokens] = useState(String(employee.maxTokens ?? ""));
  const [executionTimeoutMs, setExecutionTimeoutMs] = useState(String(limits.executionTimeoutMs));
  const [retryCount, setRetryCount] = useState(String(limits.retryCount));
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState(String(limits.rateLimitPerMinute));
  const [maxConcurrency, setMaxConcurrency] = useState(String(limits.maxConcurrency));

  useEffect(() => {
    setTemperature(String(employee.temperature ?? ""));
    setMaxTokens(String(employee.maxTokens ?? ""));
    setExecutionTimeoutMs(String(employee.runtimeConfiguration.executionTimeoutMs));
    setRetryCount(String(employee.runtimeConfiguration.retryCount));
    setRateLimitPerMinute(String(employee.runtimeConfiguration.rateLimitPerMinute));
    setMaxConcurrency(String(employee.runtimeConfiguration.maxConcurrency));
  }, [employee]);

  const handleSave = () => {
    onSave({
      temperature: temperature.trim() ? Number(temperature) : null,
      maxTokens: maxTokens.trim() ? Number(maxTokens) : null,
      runtimeConfiguration: {
        executionTimeoutMs: Number(executionTimeoutMs),
        retryCount: Number(retryCount),
        rateLimitPerMinute: Number(rateLimitPerMinute),
        maxConcurrency: Number(maxConcurrency),
      },
    });
  };

  return (
    <div className="space-y-6">
      <ConfigSection title={t("aiEmployees.config.sections.limits")}>
        {canEdit ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("aiEmployees.form.temperature")} htmlFor="temperature">
              <Input id="temperature" value={temperature} onChange={(event) => setTemperature(event.target.value)} className="rounded-xl" />
            </Field>
            <Field label={t("aiEmployees.form.maxTokens")} htmlFor="maxTokens">
              <Input id="maxTokens" value={maxTokens} onChange={(event) => setMaxTokens(event.target.value)} className="rounded-xl" />
            </Field>
            <Field label={t("aiEmployees.config.fields.executionTimeoutMs")} htmlFor="executionTimeoutMs">
              <Input id="executionTimeoutMs" value={executionTimeoutMs} onChange={(event) => setExecutionTimeoutMs(event.target.value)} className="rounded-xl" />
            </Field>
            <Field label={t("aiEmployees.config.fields.retryCount")} htmlFor="retryCount">
              <Input id="retryCount" value={retryCount} onChange={(event) => setRetryCount(event.target.value)} className="rounded-xl" />
            </Field>
            <Field label={t("aiEmployees.config.fields.rateLimitPerMinute")} htmlFor="rateLimitPerMinute">
              <Input id="rateLimitPerMinute" value={rateLimitPerMinute} onChange={(event) => setRateLimitPerMinute(event.target.value)} className="rounded-xl" />
            </Field>
            <Field label={t("aiEmployees.config.fields.maxConcurrency")} htmlFor="maxConcurrency">
              <Input id="maxConcurrency" value={maxConcurrency} onChange={(event) => setMaxConcurrency(event.target.value)} className="rounded-xl" />
            </Field>
            <div className="md:col-span-2">
              <Button className="rounded-xl" disabled={isSaving} onClick={handleSave}>
                {t("aiEmployees.save")}
              </Button>
            </div>
          </div>
        ) : (
          <ReadonlyGrid
            rows={[
              { label: t("aiEmployees.form.temperature"), value: preview?.limits.temperature },
              { label: t("aiEmployees.form.maxTokens"), value: preview?.limits.maxTokens },
              { label: t("aiEmployees.config.fields.executionTimeoutMs"), value: preview?.limits.executionTimeoutMs },
              { label: t("aiEmployees.config.fields.retryCount"), value: preview?.limits.retryCount },
              { label: t("aiEmployees.config.fields.rateLimitPerMinute"), value: preview?.limits.rateLimitPerMinute },
              { label: t("aiEmployees.config.fields.maxConcurrency"), value: preview?.limits.maxConcurrency },
            ]}
          />
        )}
      </ConfigSection>
      <ValidationList preview={preview} />
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
