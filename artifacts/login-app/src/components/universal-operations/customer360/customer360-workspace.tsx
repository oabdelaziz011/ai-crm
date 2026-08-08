import type { OperationsRow } from "@workspace/universal-operations-engine";
import type { Customer360WorkspaceRole } from "@workspace/universal-operations-engine";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Customer360Content } from "@/components/universal-operations/customer360/customer360-content";

/** Standalone Customer360 Sheet — body lives in Customer360Content for reuse. */
export function Customer360Workspace({
  row,
  open,
  onClose,
  role = "manager",
  onRoleChange,
  templateKey = "clinic",
}: {
  row: OperationsRow | null;
  open: boolean;
  onClose: () => void;
  role?: Customer360WorkspaceRole;
  onRoleChange?: (role: Customer360WorkspaceRole) => void;
  templateKey?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="relative flex h-full w-[min(620px,50vw)] min-w-[520px] max-w-[50vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[50vw] [&>button.absolute]:hidden"
      >
        <Customer360Content
          row={row}
          role={role}
          onRoleChange={onRoleChange}
          templateKey={templateKey}
          onClose={onClose}
        />
      </SheetContent>
    </Sheet>
  );
}
