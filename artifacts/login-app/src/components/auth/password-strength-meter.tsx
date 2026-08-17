import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  getPasswordStrength,
  type PasswordStrengthLevel,
} from "@/lib/auth/password-strength";

const LEVEL_BAR_CLASS: Record<Exclude<PasswordStrengthLevel, "empty">, string> = {
  weak: "bg-destructive",
  medium: "bg-amber-500",
  strong: "bg-emerald-500",
};

const LEVEL_TEXT_CLASS: Record<Exclude<PasswordStrengthLevel, "empty">, string> = {
  weak: "text-destructive",
  medium: "text-amber-600 dark:text-amber-400",
  strong: "text-emerald-600 dark:text-emerald-400",
};

type Props = {
  password: string;
  className?: string;
};

export function PasswordStrengthMeter({ password, className }: Props) {
  const { t } = useTranslation("common");
  const { level, score } = getPasswordStrength(password);

  if (level === "empty") return null;

  const widthPercent = (score / 3) * 100;

  return (
    <div className={cn("mt-2 space-y-1.5", className)} aria-live="polite">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300 ease-out",
            LEVEL_BAR_CLASS[level],
          )}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <p className={cn("text-[11px] font-medium", LEVEL_TEXT_CLASS[level])}>
        {t(`auth.validation.passwordStrength.${level}`)}
      </p>
    </div>
  );
}
