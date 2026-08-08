import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  __resetConversationTraceCorrelationForTests,
  lookupConversationTraceByOutboundExternalId,
  printConversationTraceStatusUpdate,
  runWithWhatsAppConversationTrace,
  setWhatsAppConversationTrace,
  WhatsAppConversationTrace,
} from "./whatsapp-conversation-trace.js";

describe("WhatsAppConversationTrace", () => {
  afterEach(() => {
    setWhatsAppConversationTrace(null);
    __resetConversationTraceCorrelationForTests();
  });

  it("keeps concurrent ALS scopes isolated", async () => {
    const a = new WhatsAppConversationTrace("trace-a");
    const b = new WhatsAppConversationTrace("trace-b");

    await Promise.all([
      runWithWhatsAppConversationTrace(a, async () => {
        a.bindConversation("conv-a");
        await new Promise((r) => setTimeout(r, 20));
        assert.equal(a.conversationId, "conv-a");
      }),
      runWithWhatsAppConversationTrace(b, async () => {
        b.bindConversation("conv-b");
        await new Promise((r) => setTimeout(r, 5));
        assert.equal(b.conversationId, "conv-b");
      }),
    ]);

    assert.equal(a.conversationId, "conv-a");
    assert.equal(b.conversationId, "conv-b");
  });

  it("correlates delivery/read status by outbound external message id", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    try {
      const trace = new WhatsAppConversationTrace("2db8-test-trace");
      await runWithWhatsAppConversationTrace(trace, async () => {
        trace.bindConversation("conv-1");
        trace.bindWorkflow("wf-1");
        trace.bindAutomationRun("run-1");
        trace.registerOutboundExternalId("wamid.outbound-1");
      });

      const entry = lookupConversationTraceByOutboundExternalId("wamid.outbound-1");
      assert.ok(entry);
      assert.equal(entry!.traceId, "2db8-test-trace");

      printConversationTraceStatusUpdate("wamid.outbound-1", "delivered");
      printConversationTraceStatusUpdate("wamid.outbound-1", "read");

      const joined = logs.join("\n");
      assert.match(joined, /TRACE/);
      assert.match(joined, /2db8-test-trace/);
      assert.match(joined, /delivered/);
      assert.match(joined, /read/);
    } finally {
      console.log = originalLog;
    }
  });

  it("prints the inbound TRACE summary block once", () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    try {
      const trace = new WhatsAppConversationTrace("summary-trace");
      trace.bindConversation("c1");
      trace.setWorkflowTime(1234);
      trace.recordQuery(10);
      trace.recordQuery(20);
      trace.recordNode();
      trace.incrementOutbound(1);
      trace.setCacheStats(3, 1);
      trace.printSummary();
      trace.printSummary();

      const joined = logs.join("\n");
      assert.equal((joined.match(/TRACE/g) ?? []).length, 1);
      assert.match(joined, /Conversation/);
      assert.match(joined, /Workflow Time/);
      assert.match(joined, /1234 ms/);
      assert.match(joined, /Queries\n2/);
      assert.match(joined, /Cache Hits\n3/);
      assert.match(joined, /Outbound Count\n1/);
    } finally {
      console.log = originalLog;
    }
  });
});
