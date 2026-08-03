import type { OperationsRow } from "@workspace/universal-operations-engine";
import { Customer360Workspace } from "@/components/universal-operations/customer360/customer360-workspace";
import { useCustomer360Role } from "@/hooks/universal-operations/use-customer360-workspace";

/** OP1 entry point — Customer360 workspace with OP3 intelligence layer. */
export function OperationsWorkspacePanel({
  row,
  open,
  onClose,
  templateKey = "clinic",
}: {
  row: OperationsRow | null;
  open: boolean;
  onClose: () => void;
  templateKey?: string;
}) {
  const { role, setRole } = useCustomer360Role();

  return (
    <Customer360Workspace
      row={row}
      open={open}
      onClose={onClose}
      role={role}
      onRoleChange={setRole}
      templateKey={templateKey}
    />
  );
}
