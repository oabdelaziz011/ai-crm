import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BranchRecord } from "@/lib/company/branches/types";

type BranchSelectorProps = {
  branches: Pick<BranchRecord, "id" | "name">[];
  value: string | null;
  onChange: (branchId: string | null) => void;
  disabled?: boolean;
  allowAll?: boolean;
  placeholder?: string;
  className?: string;
};

function BranchSelectorComponent({
  branches,
  value,
  onChange,
  disabled,
  allowAll = false,
  placeholder,
  className,
}: BranchSelectorProps) {
  const { t } = useTranslation("common");

  const sorted = useMemo(
    () => [...branches].sort((a, b) => a.name.localeCompare(b.name)),
    [branches],
  );

  const selectValue = value ?? (allowAll ? "__all__" : "");

  return (
    <Select
      value={selectValue}
      onValueChange={(next) => onChange(next === "__all__" ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger className={className ?? "bg-background/50 border-white/10"}>
        <SelectValue placeholder={placeholder ?? t("branches.selector.placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {allowAll && (
          <SelectItem value="__all__">{t("branches.selector.allBranches")}</SelectItem>
        )}
        {sorted.map((branch) => (
          <SelectItem key={branch.id} value={branch.id}>
            {branch.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const BranchSelector = memo(BranchSelectorComponent);
