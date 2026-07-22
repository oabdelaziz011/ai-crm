import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { FIND_CUSTOMER_LOOKUP_OPTIONS } from "../../../core/crm/find-customer-config";
import { CrmLookupFieldEditor } from "./crm-lookup-field-editor";

export function FindCustomerPropertyEditor({ config, onChange, context }: NodePropertyEditorProps) {
  const lookupBy = typeof config.lookupBy === "string" ? config.lookupBy : "phone";

  return (
    <CrmLookupFieldEditor
      lookupBy={lookupBy}
      lookupOptions={FIND_CUSTOMER_LOOKUP_OPTIONS}
      valueBinding={config.value}
      onLookupByChange={(nextLookupBy) => onChange({ lookupBy: nextLookupBy })}
      onValueBindingChange={(binding) => onChange({ value: binding })}
      translationPrefix="workflowBuilder.crm.findCustomer"
      document={context?.document}
      nodeId={context?.nodeId}
    />
  );
}
