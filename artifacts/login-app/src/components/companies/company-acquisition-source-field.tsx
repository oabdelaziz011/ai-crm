import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import {
  COMPANY_ACQUISITION_SOCIAL_PLATFORMS,
  COMPANY_ACQUISITION_SOURCES,
  acquisitionFieldsForSourceChange,
  type CompanyAcquisitionSource,
} from "@/lib/companies/onboarding";

type Props = {
  value: string;
  subSource: string;
  detail: string;
  onChange: (next: {
    acquisitionSource: string;
    acquisitionSubSource?: string;
    acquisitionSourceDetail?: string;
  }) => void;
  sourceError?: string;
  subSourceError?: string;
  detailError?: string;
  idPrefix?: string;
  className?: string;
};

function NestedOptionGrid({
  options,
  value,
  groupId,
  labelKeyPrefix,
  onSelect,
  t,
  invalid,
}: {
  options: readonly string[];
  value: string;
  groupId: string;
  labelKeyPrefix: string;
  onSelect: (next: string) => void;
  t: (key: string) => string;
  invalid?: boolean;
}) {
  return (
    <RadioGroup
      value={value || undefined}
      onValueChange={onSelect}
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      aria-required="true"
      aria-invalid={Boolean(invalid)}
    >
      {options.map((option) => {
        const optionId = `${groupId}-${option}`;
        const selected = value === option;
        return (
          <Label
            key={option}
            htmlFor={optionId}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-sm transition-colors",
              "hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
              selected ? "border-primary bg-primary/5" : "border-border/80 bg-background",
              invalid && !selected ? "border-destructive/40" : null,
            )}
          >
            <RadioGroupItem id={optionId} value={option} className="shrink-0" />
            <span className="leading-snug">{t(`${labelKeyPrefix}.${option}`)}</span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}

export function CompanyAcquisitionSourceField({
  value,
  subSource,
  detail,
  onChange,
  sourceError,
  subSourceError,
  detailError,
  idPrefix = "acquisition",
  className,
}: Props) {
  const { t } = useTranslation();
  const autoId = useId();
  const groupId = `${idPrefix}-source-${autoId}`;
  const socialGroupId = `${idPrefix}-social-${autoId}`;
  const detailId = `${idPrefix}-detail-${autoId}`;
  const sourceErrorId = `${groupId}-error`;
  const subErrorId = `${groupId}-sub-error`;
  const detailErrorId = `${detailId}-error`;
  const helperId = `${groupId}-helper`;

  const isSocial = value === "social_media";
  const isTopOther = value === "other";
  const needsCustomDetail = isTopOther || subSource === "other";

  return (
    <div className={cn("space-y-3", className)}>
      <fieldset aria-describedby={helperId}>
        <legend className="text-sm font-medium text-foreground">
          {t("companyOnboarding.fields.acquisitionSource")}
          <span className="ms-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        </legend>
        <p id={helperId} className="mt-1 text-xs text-muted-foreground">
          {t("companyOnboarding.fields.acquisitionSourceHelper")}
        </p>

        <RadioGroup
          value={value || undefined}
          onValueChange={(next) => {
            const source = next as CompanyAcquisitionSource | string;
            onChange(acquisitionFieldsForSourceChange(source));
          }}
          className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"
          aria-required="true"
          aria-invalid={Boolean(sourceError)}
          aria-describedby={sourceError ? sourceErrorId : helperId}
        >
          {COMPANY_ACQUISITION_SOURCES.map((option) => {
            const optionId = `${groupId}-${option}`;
            const selected = value === option;
            return (
              <Label
                key={option}
                htmlFor={optionId}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                  "hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
                  selected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-background",
                  sourceError && !selected ? "border-destructive/40" : null,
                )}
              >
                <RadioGroupItem id={optionId} value={option} className="mt-0.5 shrink-0" />
                <span className="leading-snug">
                  {t(`companyOnboarding.acquisitionSources.${option}`)}
                </span>
              </Label>
            );
          })}
        </RadioGroup>

        {sourceError ? (
          <p id={sourceErrorId} className="mt-2 text-xs text-destructive" role="alert">
            {sourceError}
          </p>
        ) : null}
      </fieldset>

      {isSocial ? (
        <div
          className="space-y-2 rounded-lg border border-primary/30 bg-primary/[0.03] px-3 py-3"
          role="group"
          aria-label={t("companyOnboarding.fields.acquisitionSocialPlatform")}
        >
          <p className="text-xs font-medium text-foreground">
            {t("companyOnboarding.fields.acquisitionSocialPlatform")}
            <span className="ms-0.5 text-destructive" aria-hidden="true">
              *
            </span>
          </p>
          <NestedOptionGrid
            options={COMPANY_ACQUISITION_SOCIAL_PLATFORMS}
            value={subSource}
            groupId={socialGroupId}
            labelKeyPrefix="companyOnboarding.acquisitionSocialPlatforms"
            t={t}
            invalid={Boolean(subSourceError)}
            onSelect={(next) =>
              onChange({
                acquisitionSource: "social_media",
                acquisitionSubSource: next,
                acquisitionSourceDetail: next === "other" ? detail : "",
              })
            }
          />
          {subSourceError ? (
            <p id={subErrorId} className="text-xs text-destructive" role="alert">
              {subSourceError}
            </p>
          ) : null}
        </div>
      ) : null}

      {needsCustomDetail ? (
        <div className="space-y-1.5">
          <Label htmlFor={detailId}>
            {t("companyOnboarding.fields.acquisitionSourceDetail")}
            <span className="ms-0.5 text-destructive" aria-hidden="true">
              *
            </span>
          </Label>
          <Input
            id={detailId}
            value={detail}
            onChange={(event) =>
              onChange({
                acquisitionSource: value,
                acquisitionSubSource: isTopOther ? "" : subSource || "other",
                acquisitionSourceDetail: event.target.value,
              })
            }
            aria-required="true"
            aria-invalid={Boolean(detailError)}
            aria-describedby={detailError ? detailErrorId : undefined}
            className={cn(detailError && "border-destructive focus-visible:ring-destructive/40")}
            maxLength={500}
            autoComplete="off"
          />
          {detailError ? (
            <p id={detailErrorId} className="text-xs text-destructive" role="alert">
              {detailError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
