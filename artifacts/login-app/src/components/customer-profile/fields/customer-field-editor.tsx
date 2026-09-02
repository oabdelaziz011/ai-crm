import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  customerPhoneErrorI18nKey,
  useUpdateCustomer,
} from "@/hooks/use-customers";
import type { Customer } from "@/lib/types";
import { normalizeGenderStorageValue } from "@/lib/customer-gender";
import { CustomerPhoneInput } from "@/components/customers/customer-phone-input";
import { validateCustomerPhoneFormInput } from "@/lib/customers/customer-phone-form";

export type CustomerFieldKey = "name" | "phone" | "email" | "age" | "gender" | "notes";

type Props = {
  label: string;
  value: string;
  displayValue?: string;
  field: CustomerFieldKey;
  customerId: string;
  customer?: Pick<Customer, "phone" | "phone_country_iso" | "phone_e164"> | null;
  inputType?: "text" | "tel" | "number" | "email";
  multiline?: boolean;
  hideLabel?: boolean;
  selectOptions?: Array<{ value: string; label: string }>;
  canEdit: boolean;
  forceEditing?: boolean;
};

export function CustomerFieldEditor({
  label,
  value,
  displayValue,
  field,
  customerId,
  customer = null,
  inputType = "text",
  multiline = false,
  hideLabel = false,
  selectOptions,
  canEdit,
  forceEditing = false,
}: Props) {
  const { t } = useTranslation("common");
  const update = useUpdateCustomer();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [phoneRegion, setPhoneRegion] = useState<string | null>(
    customer?.phone_country_iso ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
      setPhoneRegion(customer?.phone_country_iso ?? null);
    }
  }, [editing, value, customer?.phone_country_iso]);

  useEffect(() => {
    if (forceEditing && canEdit) setEditing(true);
  }, [forceEditing, canEdit]);

  useEffect(() => {
    if (!editing || field === "phone") return;
    const target = multiline ? textareaRef.current : inputRef.current;
    target?.focus();
    if (target && "select" in target) target.select();
  }, [editing, multiline, field]);

  const cancel = () => {
    setDraft(value);
    setPhoneRegion(customer?.phone_country_iso ?? null);
    setError(null);
    setEditing(false);
  };

  const save = () => {
    const trimmed = draft.trim();
    if (field === "name" && !trimmed) {
      setError(t("forms.customer.nameRequired"));
      return;
    }
    if (field === "email" && trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(t("forms.customer.invalidEmail"));
      return;
    }
    if (field === "age" && trimmed) {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 150) {
        setError(t("forms.customer.invalidAge"));
        return;
      }
    }

    if (field === "phone") {
      const validation = validateCustomerPhoneFormInput({
        phone: trimmed || null,
        region: phoneRegion,
      });
      if (validation.code === "phone_region_required") {
        setError(t("forms.customer.phoneRegionRequired"));
        return;
      }
      if (validation.code === "invalid_phone") {
        setError(t("forms.customer.invalidPhone"));
        return;
      }
      update.mutate(
        {
          id: customerId,
          values: {
            phone: trimmed || null,
            phone_country_iso: phoneRegion,
          },
          previous: customer ?? {
            phone: value,
            phone_country_iso: null,
            phone_e164: null,
          },
        },
        {
          onSuccess: () => cancel(),
          onError: (e) => {
            const key = customerPhoneErrorI18nKey(e);
            setError(key ? t(key) : e.message);
          },
        },
      );
      return;
    }

    if (trimmed === value.trim()) {
      cancel();
      return;
    }

    const payload: Record<string, string | number | null> = {
      [field]:
        field === "age"
          ? trimmed
            ? Number.parseInt(trimmed, 10)
            : null
          : field === "gender"
            ? trimmed
              ? normalizeGenderStorageValue(trimmed)
              : null
            : trimmed || null,
    };

    update.mutate(
      { id: customerId, values: payload },
      {
        onSuccess: () => cancel(),
        onError: (e) => setError(e.message),
      },
    );
  };

  const shown = displayValue ?? (value.trim() || t("forms.customer.notSet"));

  return (
    <div className="group rounded-lg border border-white/10 bg-background/25 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {!hideLabel && (
            <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
          )}
          {!editing ? (
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => canEdit && setEditing(true)}
              className={`text-sm font-medium text-left w-full ${multiline ? "whitespace-pre-wrap min-h-[72px]" : "truncate"} ${
                canEdit ? "hover:text-primary transition-colors cursor-pointer" : "cursor-default"
              }`}
            >
              <span dir={field === "phone" ? "ltr" : undefined}>{shown}</span>
            </button>
          ) : field === "phone" ? (
            <CustomerPhoneInput
              phone={draft}
              region={phoneRegion}
              onPhoneChange={setDraft}
              onRegionChange={setPhoneRegion}
              disabled={update.isPending}
            />
          ) : selectOptions ? (
            <Select
              value={draft || "__empty__"}
              onValueChange={(next) => setDraft(next === "__empty__" ? "" : next)}
            >
              <SelectTrigger className="h-8 bg-background/50 border-white/10">
                <SelectValue placeholder={t("forms.customer.genderPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">{t("forms.customer.notSet")}</SelectItem>
                {selectOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : multiline ? (
            <textarea
              ref={textareaRef}
              value={draft}
              rows={4}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancel();
              }}
              className="w-full rounded-md bg-background/50 border border-white/10 px-3 py-2 text-sm outline-none focus:border-primary/40 resize-y min-h-[96px]"
            />
          ) : (
            <Input
              ref={inputRef}
              type={inputType}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") cancel();
              }}
              className="h-8 bg-background/50 border-white/10"
            />
          )}
        </div>
        {canEdit && (
          <div
            className={`flex items-center gap-0.5 shrink-0 ${
              editing ? "opacity-100" : "opacity-0 group-hover:opacity-100 transition-opacity"
            }`}
          >
            {!editing ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={() => setEditing(true)}
              >
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7"
                  disabled={update.isPending}
                  onClick={save}
                >
                  {update.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3 text-primary" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7"
                  disabled={update.isPending}
                  onClick={cancel}
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
    </div>
  );
}
