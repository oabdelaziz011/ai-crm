import { useTranslation } from "react-i18next";
import { CollapsibleSidebar } from "../layout/collapsible-sidebar";
import { NodePalette } from "./node-palette";
import { PALETTE_WIDTH_PX, usePaletteCollapsed } from "../../hooks/use-palette-collapsed";

export function CollapsibleNodePalette() {
  const { t } = useTranslation("common");
  const { collapsed, toggle } = usePaletteCollapsed();

  return (
    <CollapsibleSidebar
      panelId="workflow-builder-node-palette"
      widthPx={PALETTE_WIDTH_PX}
      collapsed={collapsed}
      onToggle={toggle}
      edge="trailing"
      collapseLabel={t("workflowBuilder.palette.collapse")}
      expandLabel={t("workflowBuilder.palette.expand")}
    >
      <NodePalette className="h-full" />
    </CollapsibleSidebar>
  );
}
