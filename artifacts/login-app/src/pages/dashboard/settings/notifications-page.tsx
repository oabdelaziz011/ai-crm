import { useMemo } from "react";
import { Link } from "wouter";
import { Bell, Loader2, Mail, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  useNotificationPreferences,
  useUpdateNotificationPreference,
} from "@/hooks/notifications/use-notification-preferences";
import {
  buildEventMuteWorkingHours,
  buildMutedEventsForTopicToggle,
  isChannelEnabled,
  isTopicEnabled,
  readMutedEvents,
  type NotificationTopicId,
} from "@/lib/notifications/preference-settings";
import type { NotificationChannel } from "@/lib/notifications/types";

type ChannelRow = {
  channel: NotificationChannel;
  labelKey: string;
  descriptionKey: string;
};

type TopicRow = {
  topic: NotificationTopicId;
  labelKey: string;
  descriptionKey: string;
};

const CHANNEL_ROWS: ChannelRow[] = [
  {
    channel: "in_app",
    labelKey: "dashboard.settings.notifications.inApp",
    descriptionKey: "dashboard.settings.notifications.inAppDesc",
  },
  {
    channel: "email",
    labelKey: "dashboard.settings.notifications.emailAlerts",
    descriptionKey: "dashboard.settings.notifications.emailAlertsDesc",
  },
  {
    channel: "whatsapp",
    labelKey: "dashboard.settings.notifications.whatsappAlerts",
    descriptionKey: "dashboard.settings.notifications.whatsappAlertsDesc",
  },
];

const TOPIC_ROWS: TopicRow[] = [
  {
    topic: "new_bookings",
    labelKey: "dashboard.settings.notifications.newBookings",
    descriptionKey: "dashboard.settings.notifications.newBookingsDesc",
  },
  {
    topic: "invoice_paid",
    labelKey: "dashboard.settings.notifications.invoicePaid",
    descriptionKey: "dashboard.settings.notifications.invoicePaidDesc",
  },
];

export function SettingsNotificationsPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile, user } = useAuth();
  const companyId = profile?.company_id ?? null;
  const userId = user?.id ?? null;

  const { data: preferences = [], isLoading, isError } = useNotificationPreferences(companyId);
  const updatePreference = useUpdateNotificationPreference(companyId);

  const channelState = useMemo(() => {
    const map = {} as Record<NotificationChannel, boolean>;
    for (const row of CHANNEL_ROWS) {
      map[row.channel] = isChannelEnabled(preferences, userId, row.channel);
    }
    return map;
  }, [preferences, userId]);

  const topicState = useMemo(() => {
    const map = {} as Record<NotificationTopicId, boolean>;
    for (const row of TOPIC_ROWS) {
      map[row.topic] = isTopicEnabled(preferences, userId, row.topic);
    }
    return map;
  }, [preferences, userId]);

  const saving = updatePreference.isPending;

  const handleChannelToggle = async (channel: NotificationChannel, enabled: boolean) => {
    if (!companyId || !userId) return;
    try {
      await updatePreference.mutateAsync({
        companyId,
        userId,
        scope: "user",
        channel,
        minPriority: null,
        muted: !enabled,
        workingHours: null,
      });
      toast({
        title: t("dashboard.settings.notifications.savedTitle", "Preferences saved"),
        description: t(
          "dashboard.settings.notifications.savedDescription",
          "Your notification preferences were updated.",
        ),
      });
    } catch {
      toast({
        variant: "destructive",
        title: t("dashboard.settings.notifications.saveFailedTitle", "Could not save"),
        description: t(
          "dashboard.settings.notifications.saveFailedDescription",
          "Please try again.",
        ),
      });
    }
  };

  const handleTopicToggle = async (topic: NotificationTopicId, enabled: boolean) => {
    if (!companyId || !userId) return;
    const nextMuted = buildMutedEventsForTopicToggle(
      readMutedEvents(preferences, userId),
      topic,
      enabled,
    );
    try {
      await updatePreference.mutateAsync({
        companyId,
        userId,
        scope: "user",
        channel: null,
        minPriority: null,
        muted: false,
        workingHours: buildEventMuteWorkingHours(nextMuted),
      });
      toast({
        title: t("dashboard.settings.notifications.savedTitle", "Preferences saved"),
        description: t(
          "dashboard.settings.notifications.savedDescription",
          "Your notification preferences were updated.",
        ),
      });
    } catch {
      toast({
        variant: "destructive",
        title: t("dashboard.settings.notifications.saveFailedTitle", "Could not save"),
        description: t(
          "dashboard.settings.notifications.saveFailedDescription",
          "Please try again.",
        ),
      });
    }
  };

  if (!companyId) {
    return (
      <DashboardCard className="p-6">
        <p className="text-sm text-muted-foreground">
          {t(
            "dashboard.settings.notifications.noCompany",
            "Join or create a company to manage notification preferences.",
          )}
        </p>
      </DashboardCard>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardCard className="p-6">
        <div className="mb-5 flex items-start gap-3">
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <h3 className="font-semibold">{t("common.notifications")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "dashboard.settings.notifications.pageDescription",
                "Choose what you receive. Changes apply immediately to new notifications.",
              )}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading", "Loading…")}
          </div>
        ) : null}

        {isError ? (
          <p className="text-sm text-destructive">
            {t(
              "dashboard.settings.notifications.loadFailed",
              "Could not load notification preferences.",
            )}
          </p>
        ) : null}

        {!isLoading && !isError ? (
          <div className="space-y-8">
            <section className="space-y-3">
              <h4 className="text-sm font-medium text-foreground">
                {t("dashboard.settings.notifications.channelsTitle", "Delivery channels")}
              </h4>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {CHANNEL_ROWS.map((row) => {
                  const id = `notif-channel-${row.channel}`;
                  const enabled = channelState[row.channel];
                  return (
                    <li
                      key={row.channel}
                      className="flex items-center gap-4 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <Label htmlFor={id} className="text-sm font-medium">
                          {t(row.labelKey)}
                        </Label>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t(row.descriptionKey)}
                        </p>
                      </div>
                      <Switch
                        id={id}
                        checked={enabled}
                        disabled={saving || !userId}
                        onCheckedChange={(checked) => {
                          void handleChannelToggle(row.channel, checked);
                        }}
                        aria-label={t(row.labelKey)}
                      />
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-3 text-xs">
                <Link
                  href="/dashboard/settings/email"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {t("dashboard.settings.notifications.configureEmail", "Configure email")}
                </Link>
                <Link
                  href="/dashboard/settings/whatsapp"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {t("dashboard.settings.notifications.configureWhatsapp", "Configure WhatsApp")}
                </Link>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-medium text-foreground">
                {t("dashboard.settings.notifications.topicsTitle", "Topics")}
              </h4>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {TOPIC_ROWS.map((row) => {
                  const id = `notif-topic-${row.topic}`;
                  const enabled = topicState[row.topic];
                  return (
                    <li key={row.topic} className="flex items-center gap-4 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <Label htmlFor={id} className="text-sm font-medium">
                          {t(row.labelKey)}
                        </Label>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t(row.descriptionKey)}
                        </p>
                      </div>
                      <Switch
                        id={id}
                        checked={enabled}
                        disabled={saving || !userId}
                        onCheckedChange={(checked) => {
                          void handleTopicToggle(row.topic, checked);
                        }}
                        aria-label={t(row.labelKey)}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        ) : null}
      </DashboardCard>
    </div>
  );
}
