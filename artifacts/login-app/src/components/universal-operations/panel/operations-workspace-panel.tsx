import type { OperationsRow, OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";
import {
  AppointmentDrawer,
  type AppointmentDrawerActionApi,
} from "@/components/universal-operations/appointment-drawer/appointment-drawer";

/** Operations Queue — Enterprise Appointment Drawer (right sheet, no navigation). */
export function OperationsWorkspacePanel({
  row,
  rows,
  open,
  onClose,
  onSelectRow,
  config,
  actions,
}: {
  row: OperationsRow | null;
  rows: OperationsRow[];
  open: boolean;
  onClose: () => void;
  onSelectRow: (row: OperationsRow) => void;
  templateKey?: string;
  config?: OperationsWorkspaceConfig;
  actions: AppointmentDrawerActionApi;
}) {
  return (
    <AppointmentDrawer
      row={row}
      rows={rows}
      open={open}
      onClose={onClose}
      onSelectRow={onSelectRow}
      config={config}
      actions={actions}
    />
  );
}
