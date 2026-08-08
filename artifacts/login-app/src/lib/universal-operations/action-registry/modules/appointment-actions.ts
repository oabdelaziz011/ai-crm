import { Archive, CheckCheck, ClipboardPlus, LogIn, Stethoscope, UserRoundPlus, UserX, XCircle } from "lucide-react";
import type { OperationsActionDefinition } from "../types";

/**
 * Appointment / visit mutations registered in the Action Registry.
 * Availability (state + role + confirmation) is decided by the Enterprise Workflow Engine.
 */
export const appointmentActions: OperationsActionDefinition[] = [
  {
    id: "appointments.check_in",
    titleKey: "universalOperations.actions.items.checkIn",
    icon: LogIn,
    group: "workflow",
    order: 10,
    requiredPermissions: ["operations.write", "operations.queue.checkin"],
    permissionMode: "disable",
    surfaces: ["menu", "quickBar"],
    dialog: "confirm",
    visible: () => true,
    enabled: () => true,
    execute: async (runtime) => {
      await runtime.commands.checkIn(runtime.row.id);
    },
  },
  {
    id: "appointments.send_to_nurse",
    titleKey: "universalOperations.actions.items.sendToNurse",
    icon: UserRoundPlus,
    group: "workflow",
    order: 20,
    requiredPermissions: ["operations.write"],
    permissionMode: "disable",
    surfaces: ["menu", "quickBar"],
    dialog: "confirm",
    visible: () => true,
    enabled: () => true,
    execute: async (runtime) => {
      await runtime.commands.transitionClinicStatus({
        bookingId: runtime.row.id,
        status: "with_nurse",
      });
    },
  },
  {
    id: "appointments.complete_triage",
    titleKey: "universalOperations.actions.items.completeTriage",
    icon: ClipboardPlus,
    group: "workflow",
    order: 25,
    requiredPermissions: ["operations.write"],
    permissionMode: "disable",
    surfaces: ["menu", "quickBar"],
    dialog: "confirm",
    visible: () => true,
    enabled: () => true,
    execute: async (runtime) => {
      await runtime.commands.completeTriage({ bookingId: runtime.row.id });
    },
  },
  {
    id: "appointments.send_to_doctor",
    titleKey: "universalOperations.actions.items.sendToDoctor",
    icon: Stethoscope,
    group: "workflow",
    order: 30,
    requiredPermissions: ["operations.write"],
    permissionMode: "disable",
    surfaces: ["menu", "quickBar"],
    dialog: "confirm",
    visible: () => true,
    enabled: () => true,
    execute: async (runtime) => {
      await runtime.commands.transitionClinicStatus({
        bookingId: runtime.row.id,
        status: "in_progress",
      });
    },
  },
  {
    id: "appointments.complete_visit",
    titleKey: "universalOperations.actions.items.completeVisit",
    icon: CheckCheck,
    group: "workflow",
    order: 40,
    requiredPermissions: ["operations.write", "operations.queue.complete"],
    permissionMode: "disable",
    surfaces: ["menu", "quickBar"],
    dialog: "confirm",
    visible: () => true,
    enabled: () => true,
    execute: async (runtime) => {
      await runtime.commands.checkOut(runtime.row.id);
    },
  },
  {
    id: "appointments.archive",
    titleKey: "universalOperations.actions.items.archive",
    icon: Archive,
    group: "workflow",
    order: 50,
    requiredPermissions: ["operations.write"],
    permissionMode: "disable",
    surfaces: ["menu", "quickBar"],
    dialog: "confirm",
    visible: () => true,
    enabled: () => true,
    execute: async (runtime) => {
      await runtime.commands.transitionClinicStatus({
        bookingId: runtime.row.id,
        status: "archived",
      });
    },
  },
  {
    id: "appointments.mark_no_show",
    titleKey: "universalOperations.actions.items.markNoShow",
    icon: UserX,
    group: "workflow",
    order: 60,
    requiredPermissions: ["operations.write"],
    permissionMode: "disable",
    dialog: "confirm",
    visible: () => true,
    enabled: () => true,
    execute: async (runtime) => {
      await runtime.commands.markNoShow({ bookingId: runtime.row.id });
    },
  },
  {
    id: "appointments.cancel",
    titleKey: "universalOperations.actions.items.cancelAppointment",
    icon: XCircle,
    group: "danger",
    order: 10,
    requiredPermissions: ["booking.write", "bookings.delete"],
    permissionMode: "disable",
    surfaces: ["menu", "quickBar"],
    dialog: "confirm",
    destructive: true,
    visible: () => true,
    enabled: () => true,
    execute: async (runtime) => {
      await runtime.commands.cancelBooking({ bookingId: runtime.row.id });
    },
  },
];
