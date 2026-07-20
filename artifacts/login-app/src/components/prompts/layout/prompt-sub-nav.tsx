import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { promptNavItems } from "@/config/prompt-route-registry";

export function PromptSubNav() {
  const { t } = useTranslation("common");
  const [location] = useLocation();

  return (
    <nav className="flex flex-wrap gap-2 border-b pb-3">
      {promptNavItems().map((route) => {
        const active = location.startsWith(`/dashboard/prompts${route.nestedPath === "/" ? "" : route.nestedPath}`);
        return (
          <Link
            key={route.id}
            href={`/dashboard/prompts${route.nestedPath === "/" ? "" : route.nestedPath}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t(route.titleKey)}
          </Link>
        );
      })}
    </nav>
  );
}
