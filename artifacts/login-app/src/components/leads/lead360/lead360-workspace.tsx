import { useTranslation } from "react-i18next";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { useLead360Workspace } from "@/hooks/leads/use-lead360-workspace";
import { useLeadCommands } from "@/hooks/leads/use-lead-commands";
import type { Lead360SectionId } from "@workspace/universal-operations-engine";

export function Lead360Workspace({
  leadId,
  open,
  onClose,
}: {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation("common");
  const { data, isLoading, sections } = useLead360Workspace(leadId);
  const commands = useLeadCommands();

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[620px]">
        {isLoading || !data ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <DashboardPageFallback />
          </div>
        ) : (
          <>
            <div className="border-b border-border/60 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{data.identity.title}</h2>
                  <p className="text-sm text-muted-foreground">{data.identity.contactName}</p>
                </div>
                <Badge variant={data.profile.scoreBand === "hot" ? "destructive" : "secondary"}>
                  {t(`leads.scoreBand.${data.profile.scoreBand}`)}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="capitalize">{data.profile.stageName ?? data.profile.lifecycleStatus}</span>
                <span>·</span>
                <span>{t("leads360.scoreLabel", { score: data.profile.score })}</span>
                {data.profile.estimatedValue != null && (
                  <>
                    <span>·</span>
                    <span>
                      {data.profile.currency} {data.profile.estimatedValue.toLocaleString()}
                    </span>
                  </>
                )}
              </div>
              {!data.profile.customerId && (
                <Button
                  size="sm"
                  className="mt-4"
                  disabled={commands.convert.isPending}
                  onClick={() => leadId && commands.convert.mutate({ leadId })}
                >
                  {t("leads360.convert")}
                </Button>
              )}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {sections.map((section) => (
                <Lead360Section key={section.id} sectionId={section.id} data={data} titleKey={section.titleKey} />
              ))}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Lead360Section({
  sectionId,
  data,
  titleKey,
}: {
  sectionId: Lead360SectionId;
  data: NonNullable<ReturnType<typeof useLead360Workspace>["data"]>;
  titleKey: string;
}) {
  const { t } = useTranslation("common");

  return (
    <section className="rounded-xl border border-border/60 p-4">
      <h3 className="mb-3 text-sm font-semibold">{t(titleKey)}</h3>
      {sectionId === "overview" && (
        <div className="space-y-2 text-sm">
          <div>{data.profile.companyName ?? t("leads360.empty.company")}</div>
          <div>{data.profile.email ?? t("leads360.empty.email")}</div>
          <div>{data.profile.phone ?? t("leads360.empty.phone")}</div>
          <div className="text-muted-foreground">{data.intelligence.summary}</div>
        </div>
      )}
      {sectionId === "contacts" && (
        <div className="space-y-2">
          {data.contacts.map((c) => (
            <div key={c.id} className="text-sm">
              <div className="font-medium">{c.name}</div>
              <div className="text-muted-foreground">{c.email ?? c.phone}</div>
            </div>
          ))}
          {data.contacts.length === 0 && (
            <div className="text-sm text-muted-foreground">{t("leads360.empty.contacts")}</div>
          )}
        </div>
      )}
      {sectionId === "tags" && (
        <div className="flex flex-wrap gap-2">
          {data.tags.map((tag) => (
            <Badge key={tag.id} variant="outline">
              {tag.label}
            </Badge>
          ))}
          {data.tags.length === 0 && (
            <div className="text-sm text-muted-foreground">{t("leads360.empty.tags")}</div>
          )}
        </div>
      )}
      {sectionId === "activities" && (
        <div className="space-y-2">
          {data.activities.recent.map((activity) => (
            <div key={activity.id} className="text-sm">
              <div className="font-medium">{activity.subject}</div>
              <div className="text-xs text-muted-foreground">{activity.channel}</div>
            </div>
          ))}
        </div>
      )}
      {sectionId === "timeline" && (
        <div className="space-y-2">
          {data.timeline.recent.slice(0, 8).map((item) => (
            <div key={item.id} className="text-sm">
              <div className="font-medium">{item.title}</div>
              <div className="text-xs text-muted-foreground">{item.occurredAt}</div>
            </div>
          ))}
        </div>
      )}
      {sectionId === "files" && (
        <div className="space-y-2">
          {data.files.map((file) => (
            <div key={file.id} className="text-sm">
              {file.fileName}
            </div>
          ))}
          {data.files.length === 0 && (
            <div className="text-sm text-muted-foreground">{t("leads360.empty.files")}</div>
          )}
        </div>
      )}
      {sectionId === "custom_fields" && (
        <div className="space-y-2">
          {data.customFields.map((field) => (
            <div key={field.key} className="flex justify-between text-sm">
              <span>{field.label}</span>
              <span className="text-muted-foreground">{field.value}</span>
            </div>
          ))}
        </div>
      )}
      {sectionId === "ai_assistant" && (
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">{t("leads360.ai.nextAction")} </span>
            {data.intelligence.nextBestAction}
          </div>
          <div>
            <span className="font-medium">{t("leads360.ai.followUp")} </span>
            {data.intelligence.suggestedFollowUp}
          </div>
          <div className="text-muted-foreground">{data.intelligence.scoreExplanation}</div>
        </div>
      )}
      {sectionId === "tasks" && (
        <div className="space-y-2">
          {data.tasks.map((task) => (
            <div key={task.id} className="text-sm">
              {task.title} — {task.status}
            </div>
          ))}
          {data.tasks.length === 0 && (
            <div className="text-sm text-muted-foreground">{t("leads360.empty.tasks")}</div>
          )}
        </div>
      )}
      {sectionId === "related_entities" && (
        <div className="space-y-2">
          {data.relatedEntities.map((rel) => (
            <div key={rel.id} className="text-sm">
              {rel.label} ({rel.relationType})
            </div>
          ))}
          {data.relatedEntities.length === 0 && (
            <div className="text-sm text-muted-foreground">{t("leads360.empty.relatedEntities")}</div>
          )}
        </div>
      )}
    </section>
  );
}
