/**
 * D5.2 — Shared CRM phone input: country selector + number + live E.164 preview.
 * Persistence stays in mutation hooks; this component does not write to the DB.
 */
import { useEffect, useMemo, useId } from "react";
import { useTranslation } from "react-i18next";
import {
  formatPhoneIdentityInternational,
  listPhoneCountryOptions,
} from "@workspace/ai-tool-router";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import {
  countryFlagEmoji,
  localizedCountryName,
  validateCustomerPhoneFormInput,
  type CustomerPhoneFormValue,
} from "@/lib/customers/customer-phone-form";

export type CustomerPhoneInputProps = {
  phone: string;
  region: string | null;
  onPhoneChange: (phone: string) => void;
  onRegionChange: (region: string | null) => void;
  onResolvedChange?: (value: CustomerPhoneFormValue) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** When true, show validation for local-without-region while typing (create flows). */
  showValidation?: boolean;
};

export function CustomerPhoneInput({
  phone,
  region,
  onPhoneChange,
  onRegionChange,
  onResolvedChange,
  disabled = false,
  id,
  className,
  showValidation = true,
}: CustomerPhoneInputProps) {
  const { t, i18n } = useTranslation("common");
  const autoId = useId();
  const phoneId = id ?? `customer-phone-${autoId}`;
  const regionId = `${phoneId}-region`;
  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";

  const countries = useMemo(() => listPhoneCountryOptions(), []);
  const options = useMemo(
    () =>
      countries.map((c) => {
        const name = localizedCountryName(c.iso, locale);
        const flag = countryFlagEmoji(c.iso);
        return {
          value: c.iso,
          label: `${flag ? `${flag} ` : ""}${name}`,
          description: `+${c.callingCode} · ${c.iso}`,
        };
      }),
    [countries, locale],
  );

  const validation = useMemo(
    () => validateCustomerPhoneFormInput({ phone, region }),
    [phone, region],
  );

  useEffect(() => {
    onResolvedChange?.(validation.preview);
  }, [validation.preview, onResolvedChange]);

  // Sync region selector from unambiguous E.164 when selector is empty.
  useEffect(() => {
    if (region) return;
    if (validation.code !== "ok" || !validation.preview.phoneCountryIso) return;
    const trimmed = phone.trim();
    if (!trimmed.startsWith("+") && !trimmed.startsWith("00")) return;
    onRegionChange(validation.preview.phoneCountryIso);
  }, [validation, phone, region, onRegionChange]);

  const validationMessage =
    showValidation && phone.trim() && validation.code === "phone_region_required"
      ? t("forms.customer.phoneRegionRequired")
      : showValidation && phone.trim() && validation.code === "invalid_phone"
        ? t("forms.customer.invalidPhone")
        : null;

  const previewCountry =
    validation.preview.phoneCountryIso != null
      ? localizedCountryName(validation.preview.phoneCountryIso, locale)
      : null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(9rem,11rem)_1fr]">
        <div>
          <label htmlFor={regionId} className="sr-only">
            {t("forms.customer.phoneCountry")}
          </label>
          <SearchableSelect
            id={regionId}
            value={region ?? ""}
            onValueChange={(value) => onRegionChange(value || null)}
            options={options}
            placeholder={t("forms.customer.phoneCountryPlaceholder")}
            searchPlaceholder={t("forms.customer.phoneCountrySearch")}
            emptyLabel={t("forms.customer.phoneCountryEmpty")}
            disabled={disabled}
            className="h-10"
          />
        </div>
        <div>
          <Input
            id={phoneId}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            disabled={disabled}
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder={t("forms.customer.phonePlaceholder")}
            className="bg-background/50 border-white/10"
            aria-invalid={validationMessage ? true : undefined}
            aria-describedby={validationMessage ? `${phoneId}-error` : undefined}
          />
        </div>
      </div>

      {validation.code === "ok" && validation.preview.phoneE164 ? (
        <div
          className="rounded-lg border border-white/10 bg-background/30 px-3 py-2 text-xs text-muted-foreground space-y-0.5"
          dir="ltr"
        >
          {phone.trim() ? (
            <p>
              <span className="text-foreground/80">{t("forms.customer.phone")}:</span> {phone.trim()}
            </p>
          ) : null}
          <p>
            <span className="text-foreground/80">{t("forms.customer.phoneInternational")}:</span>{" "}
            {formatPhoneIdentityInternational(validation.preview.phoneE164) ??
              validation.preview.phoneE164}
          </p>
          {previewCountry ? (
            <p>
              <span className="text-foreground/80">{t("forms.customer.phoneCountry")}:</span>{" "}
              <span dir="auto">{previewCountry}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {validationMessage ? (
        <p id={`${phoneId}-error`} className="text-sm text-destructive" role="alert">
          {validationMessage}
        </p>
      ) : null}
    </div>
  );
}
