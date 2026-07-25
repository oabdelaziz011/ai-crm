import { CustomerTimelinePanel } from "@/lib/customer-timeline/components/customer-timeline";

type Props = {
  customerId: string;
  companyId?: string | null;
};

export function TimelineTab({ customerId, companyId }: Props) {
  return <CustomerTimelinePanel customerId={customerId} companyId={companyId} />;
}
