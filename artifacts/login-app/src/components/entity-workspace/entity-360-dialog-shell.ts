/**
 * Shared Entity360 dialog chrome (presentation only).
 * Keep Lead360 ↔ Opportunity360 imports one-way; neither workspace imports the other via this module.
 */
export const ENTITY_360_DIALOG_CONTENT_CLASS =
  "flex h-[min(92vh,960px)] w-[calc(100vw-1rem)] max-w-[1280px] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[1280px] [&>button]:hidden";

export const ENTITY_360_TABS_LIST_CLASS =
  "h-auto w-full shrink-0 justify-start gap-0 overflow-x-auto rounded-none border-b border-border/60 bg-muted/5 p-0 px-4 sm:px-6";

export const ENTITY_360_TAB_TRIGGER_CLASS =
  "rounded-none border-b-2 border-transparent px-3.5 py-3 text-[13px] font-medium data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none";
