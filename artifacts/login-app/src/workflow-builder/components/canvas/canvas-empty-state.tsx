import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type CanvasEmptyStateProps = {
  onAddStart: () => void;
};

export function CanvasEmptyState({ onAddStart }: CanvasEmptyStateProps) {
  const { t } = useTranslation("common");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-8"
    >
      <div className="pointer-events-auto max-w-md rounded-3xl border border-border/60 bg-card/95 p-8 text-center shadow-2xl backdrop-blur">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-semibold">{t("workflowBuilder.empty.title")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("workflowBuilder.empty.subtitle")}</p>
        <Button type="button" className="mt-6 rounded-xl" onClick={onAddStart}>
          <Play className="me-2 h-4 w-4" />
          {t("workflowBuilder.empty.cta")}
        </Button>
      </div>
    </motion.div>
  );
}
