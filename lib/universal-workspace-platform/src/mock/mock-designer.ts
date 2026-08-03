import type { DesignerPaletteItem, WorkspaceDesignerState } from "../types/designer-types.js";

export const DESIGNER_PALETTE: DesignerPaletteItem[] = [
  { id: "pal_card", type: "card", labelKey: "designer.palette.card", icon: "Square", defaultSize: "md" },
  { id: "pal_widget", type: "widget", labelKey: "designer.palette.widget", icon: "LayoutGrid", defaultSize: "sm" },
  { id: "pal_section", type: "section", labelKey: "designer.palette.section", icon: "Layers", defaultSize: "lg" },
  { id: "pal_kpi", type: "kpi", labelKey: "designer.palette.kpi", icon: "TrendingUp", defaultSize: "sm" },
  { id: "pal_list", type: "list", labelKey: "designer.palette.list", icon: "List", defaultSize: "md" },
  { id: "pal_chart", type: "chart", labelKey: "designer.palette.chart", icon: "BarChart3", defaultSize: "lg" },
  { id: "pal_timeline", type: "timeline", labelKey: "designer.palette.timeline", icon: "Clock", defaultSize: "md" },
  { id: "pal_form", type: "form", labelKey: "designer.palette.form", icon: "FormInput", defaultSize: "md" },
  { id: "pal_ai", type: "ai_card", labelKey: "designer.palette.aiCard", icon: "Sparkles", defaultSize: "sm" },
  { id: "pal_report", type: "report", labelKey: "designer.palette.report", icon: "FileBarChart", defaultSize: "lg" },
  { id: "pal_comm", type: "communication", labelKey: "designer.palette.communication", icon: "MessageCircle", defaultSize: "md" },
  { id: "pal_tasks", type: "tasks", labelKey: "designer.palette.tasks", icon: "CheckSquare", defaultSize: "sm" },
  { id: "pal_files", type: "files", labelKey: "designer.palette.files", icon: "Folder", defaultSize: "sm" },
  { id: "pal_invoices", type: "invoices", labelKey: "designer.palette.invoices", icon: "Receipt", defaultSize: "md" },
  { id: "pal_bookings", type: "bookings", labelKey: "designer.palette.bookings", icon: "Calendar", defaultSize: "md" },
];

export const DEFAULT_DESIGNER_STATE: WorkspaceDesignerState = {
  id: "design_default",
  name: "Default Clinic Workspace",
  templateKey: "clinic",
  canvasBlocks: [
    { id: "cb1", paletteItemId: "pal_kpi", type: "kpi", labelKey: "designer.palette.kpi", x: 0, y: 0, w: 12, h: 2 },
    { id: "cb2", paletteItemId: "pal_timeline", type: "timeline", labelKey: "designer.palette.timeline", x: 0, y: 2, w: 8, h: 3 },
    { id: "cb3", paletteItemId: "pal_ai", type: "ai_card", labelKey: "designer.palette.aiCard", x: 8, y: 2, w: 4, h: 3 },
  ],
  updatedAt: new Date().toISOString(),
};
