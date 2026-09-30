/**
 * Reusable registration/onboarding phone field.
 * Each instance owns its own country + national number state — never share across Account vs Company.
 */
import { useTranslation } from "react-i18next";
import { CustomerPhoneInput } from "@/components/customers/customer-phone-input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ONBOARDING_PHONE_DEFAULT_REGION } from "@/lib/companies/onboarding/sync-owner-from-account";

type Props = {
  id: string;
  label: string;
  required?: boolean;
  phone: string;
  region: string;
  onPhoneChange: (phone: string) => void;
  onRegionChange: (region: string) => void;
  errorMessage?: string;
  className?: string;
  showValidation?: boolean;
};

function RequiredMark() {
  return (
    <span className="ms-0.5 text-destructive" aria-hidden="true">
      *
    </span>
  );
}

export function OnboardingPhoneField({
  id,
  label,
  required = false,
  phone,
  region,
  onPhoneChange,
  onRegionChange,
  errorMessage,
  className,
  showValidation = true,
}: Props) {
  const { t } = useTranslation();
  const regionValue = region?.trim() ? region.trim().toUpperCase() : ONBOARDING_PHONE_DEFAULT_REGION;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <RequiredMark /> : null}
      </Label>
      <CustomerPhoneInput
        id={id}
        phone={phone}
        region={regionValue}
        onPhoneChange={onPhoneChange}
        onRegionChange={(next) =>
          onRegionChange((next || ONBOARDING_PHONE_DEFAULT_REGION).toUpperCase())
        }
        showValidation={showValidation && !errorMessage}
        className="mt-0"
      />
      {errorMessage ? (
        <p id={`${id}-field-error`} className="text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        {t("companyOnboarding.fields.phoneFormatHint", {
          defaultValue: "Enter the local number; the country code is selected separately.",
        })}
      </p>
    </div>
  );
}
