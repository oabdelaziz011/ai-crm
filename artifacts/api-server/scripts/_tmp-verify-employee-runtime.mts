import "../src/load-env.js";
import { createSupabaseServiceClient } from "../src/platform/create-webhook-platform.js";
import {
  resolveInboundChannelEmployee,
  clearInboundChannelEmployeeCache,
} from "../../login-app/src/lib/ai-employees/services/resolve-inbound-channel-employee.ts";
import {
  resolveEmployeeChannelRuntime,
  clearEmployeeChannelRuntimeCache,
} from "../../login-app/src/lib/ai-employees/services/resolve-employee-channel-runtime.ts";

const client = createSupabaseServiceClient();
const companyId = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const companyChannelId = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const employeeId = "e696fd3f-da4f-44a1-b8ff-4b9ee4b85355";

clearInboundChannelEmployeeCache();
clearEmployeeChannelRuntimeCache();

const resolved = await resolveInboundChannelEmployee(client, companyId, "whatsapp", companyChannelId);
const binding = await resolveEmployeeChannelRuntime(companyId, employeeId, client);

console.log(
  JSON.stringify(
    {
      resolvedEmployeeId: resolved?.id ?? null,
      bindingProviderConnectionId: binding?.providerConnectionId ?? null,
    },
    null,
    2,
  ),
);
