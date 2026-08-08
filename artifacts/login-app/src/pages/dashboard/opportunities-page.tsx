import { Suspense, useState } from "react";
import { Redirect, Route, Switch } from "wouter";
import { useTranslation } from "react-i18next";
import { Briefcase, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import {
  Opportunity360Workspace,
  OpportunityPipelineBoard,
} from "@/components/opportunities/opportunity360-workspace";
import { useOpportunityCommands } from "@/hooks/opportunities/use-opportunity-commands";
import { useAuthUser } from "@/hooks/use-rbac";
import { NEST_INDEX } from "@/lib/routing";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OpportunitiesPage() {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canCreate = isSuperAdmin || hasPermission("opportunities.create");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const commands = useOpportunityCommands();

  return (
    <div className="flex min-h-0 w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.25rem] font-semibold tracking-tight">
            {t("navigation.opportunities", { defaultValue: "Opportunities" })}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {t("opportunities.subtitle", {
              defaultValue: "Sales execution pipeline after lead qualification.",
            })}
          </p>
        </div>
        {canCreate ? (
          <Button type="button" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("opportunities.create", { defaultValue: "New opportunity" })}
          </Button>
        ) : null}
      </div>

      <Suspense fallback={<DashboardPageFallback />}>
        <Switch>
          <Route path={NEST_INDEX}>
            <Redirect to="/pipeline" />
          </Route>
          <Route path="/pipeline">
            <OpportunityPipelineBoard onSelect={setSelectedId} />
          </Route>
        </Switch>
      </Suspense>

      <Opportunity360Workspace
        opportunityId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="size-4" />
              {t("opportunities.create", { defaultValue: "New opportunity" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="opp-name">{t("opportunities.fields.name", { defaultValue: "Name" })}</Label>
            <Input
              id="opp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("opportunities.fields.namePlaceholder", {
                defaultValue: "Acme — Enterprise deal",
              })}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={!name.trim() || commands.create.isPending}
              onClick={() => {
                commands.create.mutate(
                  { name: name.trim() },
                  {
                    onSuccess: (opp) => {
                      setCreateOpen(false);
                      setName("");
                      setSelectedId(opp.id);
                    },
                  },
                );
              }}
            >
              {t("common.create", { defaultValue: "Create" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
