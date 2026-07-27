import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { resolveDashboardBreadcrumbs } from "@/lib/routing/breadcrumb-resolver";
import { cn } from "@/lib/utils";

type AppBreadcrumbsProps = {
  className?: string;
};

export function AppBreadcrumbs({ className }: AppBreadcrumbsProps) {
  const { t, i18n } = useTranslation("common");
  const [location, setLocation] = useLocation();
  const isRtl = i18n.dir() === "rtl";
  const segments = resolveDashboardBreadcrumbs(location);

  if (segments.length <= 1) {
    return (
      <p className={cn("truncate text-sm font-semibold text-foreground", className)}>
        {t("navigation.home")}
      </p>
    );
  }

  return (
    <Breadcrumb className={cn("min-w-0", className)}>
      <BreadcrumbList className="text-xs">
        {segments.map((segment, index) => {
          const label = segment.labelKey ? t(segment.labelKey) : segment.label ?? "";
          const isLast = index === segments.length - 1;

          return (
            <span key={`${label}-${index}`} className="contents">
              {index > 0 && (
                <BreadcrumbSeparator className={cn("opacity-40", isRtl && "[&>svg]:rotate-180")} />
              )}
              <BreadcrumbItem>
                {isLast || segment.isCurrent ? (
                  <BreadcrumbPage className="max-w-[12rem] truncate text-sm font-semibold sm:max-w-xs">
                    {label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="max-w-[8rem] cursor-pointer truncate font-medium text-muted-foreground hover:text-foreground sm:max-w-[10rem]"
                    onClick={() => segment.href && setLocation(segment.href)}
                  >
                    {label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
