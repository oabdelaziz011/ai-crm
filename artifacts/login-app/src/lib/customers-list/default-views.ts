import type { SavedViewDefinition } from "./types";

export const BUILT_IN_VIEWS: SavedViewDefinition[] = [
  { id: "all", labelKey: "dashboard.customers.list.views.all", builtIn: true },
  { id: "vip", labelKey: "dashboard.customers.list.views.vip", builtIn: true },
  {
    id: "need-follow-up",
    labelKey: "dashboard.customers.list.views.needFollowUp",
    builtIn: true,
  },
  {
    id: "outstanding-payments",
    labelKey: "dashboard.customers.list.views.outstandingPayments",
    builtIn: true,
  },
  {
    id: "todays-appointments",
    labelKey: "dashboard.customers.list.views.todaysAppointments",
    builtIn: true,
  },
  { id: "inactive", labelKey: "dashboard.customers.list.views.inactive", builtIn: true },
];
