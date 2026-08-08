import { EntityAttachmentsPanel } from "@/components/entity-workspace/panels/entity-attachments-panel";

type Props = {
  customerId: string;
};

/** CRM Files tab — same shared Attachments service as Operations. */
export function WorkspaceFilesTab({ customerId }: Props) {
  return <EntityAttachmentsPanel entityType="customer" entityId={customerId} />;
}
