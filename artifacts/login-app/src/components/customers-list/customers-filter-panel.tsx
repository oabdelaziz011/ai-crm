import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import type { CustomerListFilters } from "@/lib/customers-list";

type CustomersFilterPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: CustomerListFilters;
  onChange: (patch: Partial<CustomerListFilters>) => void;
  onApply: () => void;
  onReset: () => void;
  onSaveView: (name: string) => void;
  availableTags: string[];
};

export function CustomersFilterPanel({
  open,
  onOpenChange,
  filters,
  onChange,
  onApply,
  onReset,
  onSaveView,
  availableTags,
}: CustomersFilterPanelProps) {
  const { t } = useTranslation("common");
  const [viewName, setViewName] = useState("");

  const tagOptions = useMemo(() => availableTags.slice(0, 12), [availableTags]);

  const toggleTag = (tag: string) => {
    const next = filters.tags.includes(tag)
      ? filters.tags.filter((item) => item !== tag)
      : [...filters.tags, tag];
    onChange({ tags: next });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("dashboard.customers.list.filters.title")}</SheetTitle>
          <SheetDescription>{t("dashboard.customers.list.filters.subtitle")}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <FilterField label={t("dashboard.customers.list.filters.status")}>
            <Select
              value={filters.status}
              onValueChange={(value) =>
                onChange({ status: value as CustomerListFilters["status"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.customers.list.filters.all")}</SelectItem>
                <SelectItem value="active">{t("dashboard.customers.list.status.active")}</SelectItem>
                <SelectItem value="inactive">{t("dashboard.customers.list.status.inactive")}</SelectItem>
                <SelectItem value="at_risk">{t("dashboard.customers.list.status.atRisk")}</SelectItem>
                <SelectItem value="new">{t("dashboard.customers.list.status.new")}</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label={t("dashboard.customers.list.filters.vip")}>
            <Select
              value={filters.vip === null ? "all" : filters.vip ? "yes" : "no"}
              onValueChange={(value) =>
                onChange({
                  vip: value === "all" ? null : value === "yes",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.customers.list.filters.all")}</SelectItem>
                <SelectItem value="yes">{t("dashboard.customers.list.filters.yes")}</SelectItem>
                <SelectItem value="no">{t("dashboard.customers.list.filters.no")}</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label={t("dashboard.customers.list.filters.gender")}>
            <Select value={filters.gender} onValueChange={(value) => onChange({ gender: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.customers.list.filters.all")}</SelectItem>
                <SelectItem value="male">{t("dashboard.customers.list.filters.male")}</SelectItem>
                <SelectItem value="female">{t("dashboard.customers.list.filters.female")}</SelectItem>
                <SelectItem value="other">{t("dashboard.customers.list.filters.other")}</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          <div className="grid grid-cols-2 gap-3">
            <FilterField label={t("dashboard.customers.list.filters.ageMin")}>
              <Input
                type="number"
                min={0}
                value={filters.ageMin ?? ""}
                onChange={(e) =>
                  onChange({ ageMin: e.target.value ? Number(e.target.value) : null })
                }
              />
            </FilterField>
            <FilterField label={t("dashboard.customers.list.filters.ageMax")}>
              <Input
                type="number"
                min={0}
                value={filters.ageMax ?? ""}
                onChange={(e) =>
                  onChange({ ageMax: e.target.value ? Number(e.target.value) : null })
                }
              />
            </FilterField>
          </div>

          <FilterField label={t("dashboard.customers.list.filters.source")}>
            <Select value={filters.source} onValueChange={(value) => onChange({ source: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.customers.list.filters.all")}</SelectItem>
                <SelectItem value="direct">{t("dashboard.customers.list.sources.direct")}</SelectItem>
                <SelectItem value="web">{t("dashboard.customers.list.sources.web")}</SelectItem>
                <SelectItem value="phone">{t("dashboard.customers.list.sources.phone")}</SelectItem>
                <SelectItem value="whatsapp">{t("dashboard.customers.list.sources.whatsapp")}</SelectItem>
                <SelectItem value="referral">{t("dashboard.customers.list.sources.referral")}</SelectItem>
                <SelectItem value="repeat">{t("dashboard.customers.list.sources.repeat")}</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          {tagOptions.length > 0 && (
            <FilterField label={t("dashboard.customers.list.filters.tags")}>
              <div className="flex flex-wrap gap-2">
                {tagOptions.map((tag) => (
                  <label
                    key={tag}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={filters.tags.includes(tag)}
                      onCheckedChange={() => toggleTag(tag)}
                    />
                    {tag}
                  </label>
                ))}
              </div>
            </FilterField>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FilterField label={t("dashboard.customers.list.filters.outstandingMin")}>
              <Input
                type="number"
                min={0}
                value={filters.outstandingMin ?? ""}
                onChange={(e) =>
                  onChange({
                    outstandingMin: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </FilterField>
            <FilterField label={t("dashboard.customers.list.filters.outstandingMax")}>
              <Input
                type="number"
                min={0}
                value={filters.outstandingMax ?? ""}
                onChange={(e) =>
                  onChange({
                    outstandingMax: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </FilterField>
          </div>

          <FilterField label={t("dashboard.customers.list.filters.registeredFrom")}>
            <Input
              type="date"
              value={filters.registeredFrom ?? ""}
              onChange={(e) => onChange({ registeredFrom: e.target.value || null })}
            />
          </FilterField>
          <FilterField label={t("dashboard.customers.list.filters.registeredTo")}>
            <Input
              type="date"
              value={filters.registeredTo ?? ""}
              onChange={(e) => onChange({ registeredTo: e.target.value || null })}
            />
          </FilterField>

          <FilterField label={t("dashboard.customers.list.filters.lastVisitFrom")}>
            <Input
              type="date"
              value={filters.lastVisitFrom ?? ""}
              onChange={(e) => onChange({ lastVisitFrom: e.target.value || null })}
            />
          </FilterField>
          <FilterField label={t("dashboard.customers.list.filters.lastVisitTo")}>
            <Input
              type="date"
              value={filters.lastVisitTo ?? ""}
              onChange={(e) => onChange({ lastVisitTo: e.target.value || null })}
            />
          </FilterField>

          <FilterField label={t("dashboard.customers.list.filters.appointmentFrom")}>
            <Input
              type="date"
              value={filters.appointmentFrom ?? ""}
              onChange={(e) => onChange({ appointmentFrom: e.target.value || null })}
            />
          </FilterField>
          <FilterField label={t("dashboard.customers.list.filters.appointmentTo")}>
            <Input
              type="date"
              value={filters.appointmentTo ?? ""}
              onChange={(e) => onChange({ appointmentTo: e.target.value || null })}
            />
          </FilterField>

          <FilterField label={t("dashboard.customers.list.filters.saveViewName")}>
            <Input
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder={t("dashboard.customers.list.filters.saveViewPlaceholder")}
            />
          </FilterField>
        </div>

        <SheetFooter className="mt-8 gap-2 sm:gap-2">
          <Button variant="outline" onClick={onReset}>
            {t("dashboard.customers.list.filters.reset")}
          </Button>
          <Button
            variant="secondary"
            disabled={!viewName.trim()}
            onClick={() => {
              onSaveView(viewName.trim());
              setViewName("");
            }}
          >
            {t("dashboard.customers.list.filters.saveView")}
          </Button>
          <Button
            onClick={() => {
              onApply();
              onOpenChange(false);
            }}
          >
            {t("dashboard.customers.list.filters.apply")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
