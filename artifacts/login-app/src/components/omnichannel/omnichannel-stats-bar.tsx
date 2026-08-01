import { memo } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Inbox,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type StatItem = {
  key: string;
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "muted";
};

const TONE_STYLES: Record<NonNullable<StatItem["tone"]>, string> = {
  default: "text-foreground",
  success: "text-emerald-400",
  warning: "text-amber-400",
  danger: "text-rose-400",
  info: "text-sky-400",
  muted: "text-muted-foreground",
};

const TONE_ICONS: Record<NonNullable<StatItem["tone"]>, typeof Inbox> = {
  default: Inbox,
  success: CheckCircle2,
  warning: Clock,
  danger: AlertTriangle,
  info: UserCheck,
  muted: Bot,
};

type OmnichannelStatsBarProps = {
  items: StatItem[];
  loading?: boolean;
};

export const OmnichannelStatsBar = memo(function OmnichannelStatsBar({
  items,
  loading,
}: OmnichannelStatsBarProps) {
  return (
    <div
      className="flex shrink-0 flex-wrap items-stretch gap-px overflow-hidden rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.06]"
      role="group"
      aria-label="Conversation statistics"
    >
      {items.map((item) => {
        const tone = item.tone ?? "default";
        const Icon = TONE_ICONS[tone];
        return (
          <div
            key={item.key}
            className="flex min-w-[96px] flex-1 items-center gap-2.5 rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-white/[0.03]"
          >
            <div className={cn("rounded-md bg-white/[0.04] p-1.5", TONE_STYLES[tone])}>
              <Icon className="size-3.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <span className={cn("block text-lg font-semibold tabular-nums leading-none", loading && "opacity-50", TONE_STYLES[tone])}>
                {item.value}
              </span>
              <span className="mt-1 block truncate text-[10px] text-muted-foreground">{item.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});
