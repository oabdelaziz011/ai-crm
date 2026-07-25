/**
 * Channel ↔ Workflow binding tests (repository + component).
 * Run: npm run test:channel-workflow-binding
 */
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { I18nextProvider } from "react-i18next";
import {
  fetchChannelWorkflowBinding,
  resolveChannelWorkflowBindingSave,
  saveChannelWorkflowBinding,
} from "../src/lib/channel-workflow-binding/channel-workflow-binding-repository";
import type { ChannelWorkflowBindingRecord } from "../src/lib/channel-workflow-binding/types";
import { ChannelWorkflowBindingSection } from "../src/components/channels/channel-workflow-binding-section";
import i18n from "../src/i18n";

type Row = Record<string, unknown>;

function createMockSupabase(initial: { bindings?: Row[]; flows?: Row[] } = {}) {
  const bindings = [...(initial.bindings ?? [])];
  const flows = [...(initial.flows ?? [])];

  const client = {
    from(table: string) {
      if (table === "company_channel_automation_bindings") {
        return {
          select: () => ({
            eq: (column: string, value: unknown) => ({
              is: (_col: string, _val: unknown) => ({
                async maybeSingle() {
                  const row = bindings.find(
                    (entry) => entry[column] === value && entry.deleted_at == null,
                  );
                  return { data: row ?? null, error: null };
                },
              }),
            }),
          }),
          insert: (payload: Row) => ({
            select: () => ({
              async single() {
                const row = {
                  id: `binding-${bindings.length + 1}`,
                  ...payload,
                  deleted_at: null,
                };
                bindings.push(row);
                return { data: row, error: null };
              },
            }),
          }),
          update: (payload: Row) => ({
            eq: (_column: string, id: unknown) =>
              Promise.resolve({
                error: (() => {
                  const index = bindings.findIndex((entry) => entry.id === id);
                  if (index >= 0) {
                    bindings[index] = { ...bindings[index], ...payload };
                  }
                  return null;
                })(),
              }),
          }),
        };
      }

      if (table === "automation_flows") {
        return {
          select: () => ({
            eq: (column: string, value: unknown) => ({
              eq: (column2: string, value2: unknown) => ({
                is: (_col: string, _val: unknown) => ({
                  order: () => ({
                    async then(onFulfilled: (value: { data: Row[]; error: null }) => unknown) {
                      const data = flows.filter(
                        (flow) =>
                          flow[column] === value &&
                          flow[column2] === value2 &&
                          flow.deleted_at == null,
                      );
                      return onFulfilled({ data, error: null });
                    },
                  }),
                }),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { client: client as never, bindings, flows };
}

const existingBinding: ChannelWorkflowBindingRecord = {
  id: "binding-1",
  companyId: "company-1",
  companyChannelId: "channel-1",
  automationFlowId: "flow-1",
  isEnabled: true,
};

console.log("\nChannel workflow binding tests\n");

assert.deepEqual(
  resolveChannelWorkflowBindingSave({
    companyId: "company-1",
    companyChannelId: "channel-1",
    workflowEnabled: true,
    automationFlowId: "flow-2",
    existingBinding: null,
  }),
  { action: "created", bindingId: "pending" },
);
console.log("  ✓ resolve create binding");

assert.deepEqual(
  resolveChannelWorkflowBindingSave({
    companyId: "company-1",
    companyChannelId: "channel-1",
    workflowEnabled: true,
    automationFlowId: "flow-2",
    existingBinding,
  }),
  { action: "updated", bindingId: "binding-1" },
);
console.log("  ✓ resolve update binding");

assert.deepEqual(
  resolveChannelWorkflowBindingSave({
    companyId: "company-1",
    companyChannelId: "channel-1",
    workflowEnabled: false,
    automationFlowId: "flow-1",
    existingBinding,
  }),
  { action: "disabled", bindingId: "binding-1" },
);
console.log("  ✓ resolve disable binding");

assert.deepEqual(
  resolveChannelWorkflowBindingSave({
    companyId: "company-1",
    companyChannelId: "channel-1",
    workflowEnabled: true,
    automationFlowId: null,
    existingBinding,
  }),
  { action: "invalid", reason: "missing_flow" },
);
console.log("  ✓ resolve invalid when enabled without flow");

void (async () => {
  const created = createMockSupabase();
  const createResult = await saveChannelWorkflowBinding(created.client, {
    companyId: "company-1",
    companyChannelId: "channel-1",
    workflowEnabled: true,
    automationFlowId: "flow-1",
    existingBinding: null,
  });
  assert.equal(createResult.action, "created");
  assert.equal(created.bindings.length, 1);
  assert.equal(created.bindings[0]?.is_enabled, true);
  console.log("  ✓ create binding");

  const loaded = await fetchChannelWorkflowBinding(created.client, "channel-1");
  assert.equal(loaded?.automationFlowId, "flow-1");
  console.log("  ✓ load existing binding");

  const updatedStore = createMockSupabase({
    bindings: [
      {
        id: "binding-1",
        company_id: "company-1",
        company_channel_id: "channel-1",
        automation_flow_id: "flow-1",
        is_enabled: true,
        deleted_at: null,
      },
    ],
  });
  const updateResult = await saveChannelWorkflowBinding(updatedStore.client, {
    companyId: "company-1",
    companyChannelId: "channel-1",
    workflowEnabled: true,
    automationFlowId: "flow-2",
    existingBinding: {
      id: "binding-1",
      companyId: "company-1",
      companyChannelId: "channel-1",
      automationFlowId: "flow-1",
      isEnabled: true,
    },
  });
  assert.equal(updateResult.action, "updated");
  assert.equal(updatedStore.bindings[0]?.automation_flow_id, "flow-2");
  console.log("  ✓ update binding");

  const disabledStore = createMockSupabase({
    bindings: [
      {
        id: "binding-1",
        company_id: "company-1",
        company_channel_id: "channel-1",
        automation_flow_id: "flow-1",
        is_enabled: true,
        deleted_at: null,
      },
    ],
  });
  const disableResult = await saveChannelWorkflowBinding(disabledStore.client, {
    companyId: "company-1",
    companyChannelId: "channel-1",
    workflowEnabled: false,
    automationFlowId: "flow-1",
    existingBinding: {
      id: "binding-1",
      companyId: "company-1",
      companyChannelId: "channel-1",
      automationFlowId: "flow-1",
      isEnabled: true,
    },
  });
  assert.equal(disableResult.action, "disabled");
  assert.equal(disabledStore.bindings[0]?.is_enabled, false);
  console.log("  ✓ disable binding");

  const removedStore = createMockSupabase({
    bindings: [
      {
        id: "binding-1",
        company_id: "company-1",
        company_channel_id: "channel-1",
        automation_flow_id: "flow-1",
        is_enabled: true,
        deleted_at: null,
      },
    ],
  });

  assert.deepEqual(
    resolveChannelWorkflowBindingSave({
      companyId: "company-1",
      companyChannelId: "channel-1",
      workflowEnabled: false,
      automationFlowId: null,
      existingBinding,
    }),
    { action: "removed", bindingId: "binding-1" },
  );
  console.log("  ✓ resolve remove binding when workflow cleared");

  const removeResult = await saveChannelWorkflowBinding(removedStore.client, {
    companyId: "company-1",
    companyChannelId: "channel-1",
    workflowEnabled: false,
    automationFlowId: null,
    existingBinding: {
      id: "binding-1",
      companyId: "company-1",
      companyChannelId: "channel-1",
      automationFlowId: "flow-1",
      isEnabled: true,
    },
  });
  assert.equal(removeResult.action, "removed");
  assert.ok(removedStore.bindings[0]?.deleted_at);
  assert.equal(removedStore.bindings[0]?.is_enabled, false);
  console.log("  ✓ remove binding when workflow cleared");

  const win = new Window({ url: "http://localhost/dashboard/channels" });
  (globalThis as { window?: Window; document?: Document }).window = win;
  (globalThis as { window?: Window; document?: Document }).document = win.document;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const rootEl = win.document.createElement("div");
  win.document.body.appendChild(rootEl);
  const root: Root = createRoot(rootEl);

  let enabled = true;
  let selectedFlowId = "flow-1";

  await act(async () => {
    root.render(
      React.createElement(
        I18nextProvider,
        { i18n },
        React.createElement(ChannelWorkflowBindingSection, {
          workflowEnabled: enabled,
          onWorkflowEnabledChange: (value: boolean) => {
            enabled = value;
          },
          selectedFlowId,
          onSelectedFlowIdChange: (value: string) => {
            selectedFlowId = value;
          },
          flows: [
            { id: "flow-1", name: "Welcome Flow" },
            { id: "flow-2", name: "Support Flow" },
          ],
        }),
      ),
    );
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));

  const section = win.document.querySelector('[data-testid="channel-workflow-binding-section"]');
  assert.ok(section, "binding section should render");
  assert.match(section?.textContent ?? "", /Automation Workflow/);
  assert.match(section?.textContent ?? "", /Use AI Runtime when no workflow is assigned/);
  console.log("  ✓ component renders automation workflow section");

  root.unmount();
  console.log("\nAll channel workflow binding checks passed.\n");
})();
