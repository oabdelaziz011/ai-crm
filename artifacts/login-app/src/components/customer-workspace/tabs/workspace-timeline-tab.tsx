import { CustomerTimelinePanel } from "@/lib/customer-timeline/components/customer-timeline";
import { useTranslation } from "react-i18next";

type Props = {
  customerId: string;
  companyId?: string | null;
};

export function WorkspaceTimelineTab({ customerId, companyId }: Props) {
  const { t } = useTranslation("common");

  return (
    <div className="mx-auto max-w-4xl animate-in fade-in duration-300">
      <CustomerTimelinePanel customerId={customerId} companyId={companyId} cardVariant="workspace" />
    </div>
  );
}
