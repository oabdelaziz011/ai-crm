import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type KanbanDrawerTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export type KanbanDrawerAction = {
  id: string;
  label: string;
  /** Must match the action label so tooltips never cross-wire. */
  title?: string;
  onClick: () => void;
  variant?: "default" | "outline" | "secondary";
  disabled?: boolean;
};

export function KanbanDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  tabs,
  actions,
  defaultTab,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string | null;
  tabs: readonly KanbanDrawerTab[];
  actions?: readonly KanbanDrawerAction[];
  defaultTab?: string;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex w-full flex-col gap-0 p-0 sm:max-w-lg",
          className,
        )}
      >
        <SheetHeader className="border-b border-border/60 px-5 py-4 text-start">
          <SheetTitle className="text-[1.1rem] font-semibold tracking-tight">
            {title}
          </SheetTitle>
          {subtitle ? (
            <p className="text-[13px] text-muted-foreground">{subtitle}</p>
          ) : null}
          {actions?.length ? (
            <div className="flex flex-wrap gap-2 pt-2">
              {actions.map((action) => {
                const tip = action.title ?? action.label;
                return (
                  <Button
                    key={action.id}
                    type="button"
                    size="sm"
                    variant={action.variant ?? "outline"}
                    disabled={action.disabled}
                    title={tip}
                    aria-label={tip}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </Button>
                );
              })}
            </div>
          ) : null}
        </SheetHeader>

        <Tabs
          defaultValue={defaultTab ?? tabs[0]?.id}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 overflow-x-auto border-b border-border/60 px-3">
            <TabsList className="h-auto w-max justify-start gap-1 bg-transparent p-0 py-2">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="rounded-md px-3 py-1.5 text-[12px] data-[state=active]:bg-muted"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {tabs.map((tab) => (
              <TabsContent key={tab.id} value={tab.id} className="mt-0">
                {tab.content}
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
