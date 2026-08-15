import type { LucideIcon } from "lucide-react";
import { Info } from "lucide-react";
import { Link } from "wouter";
import { DashboardCard } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { dashboardNestHref } from "@/lib/routing";
import { cn } from "@/lib/utils";

export type ModulePurposeLink = {
  href: string;
  label: string;
  icon?: LucideIcon;
  variant?: "secondary" | "outline";
};

type ModulePurposeBannerProps = {
  title: string;
  body: string;
  points?: string[];
  links?: ModulePurposeLink[];
  className?: string;
};

/** Clear “why this page exists” banner for ops/admin modules. */
export function ModulePurposeBanner({
  title,
  body,
  points = [],
  links = [],
  className,
}: ModulePurposeBannerProps) {
  return (
    <DashboardCard className={cn("border-primary/20 bg-primary/5 p-4", className)}>
      <div className="flex gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Info className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 space-y-2">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
          {points.length > 0 && (
            <ul className="list-disc space-y-1 ps-5 text-xs text-muted-foreground">
              {points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {links.map((link) => {
                const Icon = link.icon;
                return (
                  <Button
                    key={link.href + link.label}
                    asChild
                    type="button"
                    size="sm"
                    variant={link.variant ?? "outline"}
                  >
                    <Link href={dashboardNestHref(link.href)}>
                      {Icon ? <Icon className="me-1 size-3.5" /> : null}
                      {link.label}
                    </Link>
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardCard>
  );
}
