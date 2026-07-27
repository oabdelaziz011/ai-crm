import { CapabilityMultiSelect } from "@/components/scheduling/capabilities/capability-multi-select";
import type { BranchRecord } from "@/lib/company/branches/types";

type Props = {
  label: string;
  branches: Pick<BranchRecord, "id" | "name" | "code">[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  disabled?: boolean;
  isLoading?: boolean;
  emptyMessage: string;
};

export function BranchAssignmentMultiSelect({
  label,
  branches,
  selectedIds,
  onChange,
  disabled,
  isLoading,
  emptyMessage,
}: Props) {
  const items = branches.map((branch) => ({
    id: branch.id,
    label: branch.name,
    meta: branch.code ?? undefined,
  }));

  return (
    <CapabilityMultiSelect
      label={label}
      items={items}
      selectedIds={selectedIds}
      onChange={onChange}
      disabled={disabled}
      isLoading={isLoading}
      emptyMessage={emptyMessage}
    />
  );
}
