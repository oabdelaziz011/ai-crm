import { Loader2, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { useAuth } from "@/context/auth-context";
import { useMyProfile, useUpdatePreferredTheme } from "@/hooks/use-my-profile";
import { DashboardCard } from "@/components/dashboard/ui";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import {
  type AppTheme,
  cacheAppTheme,
  isAppTheme,
  resolveAppTheme,
} from "@/lib/theme/resolve-app-theme";
import { clearBrandThemeInlineStyles } from "@/lib/theme/brand-theme-service";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: readonly {
  value: AppTheme;
  icon: typeof Monitor;
  labelKey: string;
  descriptionKey: string;
  recommended?: boolean;
}[] = [
  {
    value: "system",
    icon: Monitor,
    labelKey: "dashboard.settings.appearance.system",
    descriptionKey: "dashboard.settings.appearance.systemDesc",
    recommended: true,
  },
  {
    value: "light",
    icon: Sun,
    labelKey: "dashboard.settings.appearance.light",
    descriptionKey: "dashboard.settings.appearance.lightDesc",
  },
  {
    value: "dark",
    icon: Moon,
    labelKey: "dashboard.settings.appearance.dark",
    descriptionKey: "dashboard.settings.appearance.darkDesc",
  },
];

export function AppearanceSettingsSection() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { refreshAuthContext } = useAuth();
  const { theme, setTheme } = useTheme();
  const { data: profile } = useMyProfile();
  const updateTheme = useUpdatePreferredTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme =
    mounted && isAppTheme(theme) ? theme : resolveAppTheme(profile?.preferred_theme);

  const restorePlatformStylesheetTheme = () => {
    // Drop Brand Center inline overrides → fall back to index.css :root / .dark
    clearBrandThemeInlineStyles();
  };

  const handleThemeChange = async (value: string) => {
    if (!isAppTheme(value)) {
      return;
    }

    const previous = activeTheme;
    setTheme(value);
    cacheAppTheme(value);
    if (value === "system") {
      restorePlatformStylesheetTheme();
    }

    try {
      await updateTheme.mutateAsync(value);
      await refreshAuthContext?.();
    } catch (error) {
      setTheme(previous);
      cacheAppTheme(previous);
      toast({
        title: t("dashboard.settings.appearance.saveFailedTitle"),
        description:
          error instanceof Error
            ? error.message
            : t("dashboard.settings.appearance.saveFailedDescription"),
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardCard className="p-6">
      <div className="mb-6">
        <h3 className="font-semibold">{t("dashboard.settings.appearance.title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("dashboard.settings.appearance.description")}
        </p>
      </div>

      <RadioGroup
        value={activeTheme}
        onValueChange={(value) => {
          void handleThemeChange(value);
        }}
        className="gap-3"
        disabled={updateTheme.isPending}
      >
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = activeTheme === option.value;

          return (
            <Label
              key={option.value}
              htmlFor={`theme-${option.value}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                selected
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card/40 hover:bg-muted/40",
              )}
              onClick={() => {
                if (option.value === "system" && activeTheme === "system") {
                  restorePlatformStylesheetTheme();
                }
              }}
            >
              <RadioGroupItem
                id={`theme-${option.value}`}
                value={option.value}
                className="mt-0.5"
              />
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="mt-0.5 rounded-lg border border-border bg-background/80 p-2">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {t(option.labelKey)}
                    {option.recommended ? (
                      <span className="ms-2 text-xs font-normal text-muted-foreground">
                        ({t("dashboard.settings.appearance.recommended")})
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(option.descriptionKey)}
                  </p>
                </div>
                {updateTheme.isPending && selected ? (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : null}
              </div>
            </Label>
          );
        })}
      </RadioGroup>
    </DashboardCard>
  );
}
