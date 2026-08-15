import { useMemo } from "react";
import { MessageCircle, MessagesSquare, Instagram, Radio, Ticket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompanyChannelsAdmin } from "@/hooks/channels/use-company-channels-admin";
import { formatEmployeeTagLabel } from "@/lib/ai-employees/utilities/format-employee-tag-label";
import { TICKET_CAPABILITY_TAG } from "@/lib/ai-employees/utilities/ticket-tool-scope";
import { cn } from "@/lib/utils";

const PRESET_CHANNELS = [
  { key: "whatsapp", tag: "channel:whatsapp", icon: MessageCircle },
  { key: "messenger", tag: "channel:messenger", icon: MessagesSquare },
  { key: "instagram", tag: "channel:instagram", icon: Instagram },
] as const;

const OMNICHANNEL_TAG = "capability:omnichannel";

type ChannelRoutingTagsFieldProps = {
  tags: string[];
  onChange: (tags: string[]) => void;
};

function toggleTag(tags: string[], tag: string, enabled: boolean): string[] {
  const next = new Set(tags);
  if (enabled) next.add(tag);
  else next.delete(tag);
  return Array.from(next);
}

/** Channel / capability tag picker for inbound AI employee routing. */
export function ChannelRoutingTagsField({ tags, onChange }: ChannelRoutingTagsFieldProps) {
  const { t } = useTranslation("common");
  const { data: companyChannels = [] } = useCompanyChannelsAdmin();

  const messagingChannels = useMemo(
    () =>
      companyChannels.filter((channel) => {
        const key = channel.communication_channel?.key;
        return key === "whatsapp" || key === "messenger" || key === "instagram";
      }),
    [companyChannels],
  );

  const customTags = useMemo(
    () =>
      tags.filter((tag) => {
        if (tag === OMNICHANNEL_TAG || tag === TICKET_CAPABILITY_TAG) return false;
        if (PRESET_CHANNELS.some((preset) => preset.tag === tag)) return false;
        if (tag.startsWith("channel:") && messagingChannels.some((c) => `channel:${c.id}` === tag)) {
          return false;
        }
        return true;
      }),
    [messagingChannels, tags],
  );

  return (
    <div className="space-y-3 rounded-2xl border border-border/50 bg-transparent p-4">
      <div className="space-y-1">
        <Label>{t("aiEmployees.form.channelRouting.title")}</Label>
        <p className="text-xs text-muted-foreground">{t("aiEmployees.form.channelRouting.hint")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESET_CHANNELS.map(({ key, tag, icon: Icon }) => {
          const active = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onChange(toggleTag(tags, tag, !active))}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {t(`aiEmployees.form.channelRouting.channels.${key}`)}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange(toggleTag(tags, OMNICHANNEL_TAG, !tags.includes(OMNICHANNEL_TAG)))}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
            tags.includes(OMNICHANNEL_TAG)
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/70 bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
          )}
        >
          <Radio className="size-3.5" aria-hidden />
          {t("aiEmployees.form.channelRouting.omnichannel")}
        </button>
        <button
          type="button"
          onClick={() => onChange(toggleTag(tags, TICKET_CAPABILITY_TAG, !tags.includes(TICKET_CAPABILITY_TAG)))}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
            tags.includes(TICKET_CAPABILITY_TAG)
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/70 bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
          )}
        >
          <Ticket className="size-3.5" aria-hidden />
          {t("aiEmployees.form.channelRouting.tickets")}
        </button>
      </div>

      {messagingChannels.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t("aiEmployees.form.channelRouting.companyChannels")}
          </p>
          <div className="flex flex-wrap gap-2">
            {messagingChannels.map((channel) => {
              const tag = `channel:${channel.id}`;
              const active = tags.includes(tag);
              const channelKey = channel.communication_channel?.key ?? "channel";
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => onChange(toggleTag(tags, tag, !active))}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition-colors",
                    active
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-border/70 bg-background text-muted-foreground hover:border-emerald-500/30",
                  )}
                >
                  <span className="font-medium">{channel.display_name}</span>
                  <span className="text-[10px] opacity-70">
                    {t(`aiEmployees.form.channelRouting.channels.${channelKey}`, {
                      defaultValue: channelKey,
                    })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t("aiEmployees.form.channelRouting.noCompanyChannels")}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="custom-tags">{t("aiEmployees.form.tags")}</Label>
        <Input
          id="custom-tags"
          value={customTags.join(", ")}
          onChange={(event) => {
            const nextCustom = event.target.value
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean);
            const routingTags = tags.filter((tag) => !customTags.includes(tag));
            onChange([...routingTags, ...nextCustom]);
          }}
          placeholder={t("aiEmployees.form.tagsPlaceholder")}
          className="rounded-xl"
        />
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="outline" className="rounded-lg text-[10px]">
              {formatEmployeeTagLabel(t, tag)}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
