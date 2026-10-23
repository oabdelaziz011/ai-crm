/**
 * Unit test for omnichannel sales follow-up delivery adapter.
 * Injects a Fake dispatch double — never real WhatsApp/Meta/SMTP.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ServiceContext } from "@workspace/channel-platform";
import {
  createOmnichannelSalesFollowUpDelivery,
  type OmnichannelSalesFollowUpDispatch,
} from "./sales-follow-up-delivery.js";

const ctx = { userId: "user-1", companyId: "co-1" } as ServiceContext;

describe("createOmnichannelSalesFollowUpDelivery", () => {
  it("counts one successful Fake dispatch and returns delivered with provider id", async () => {
    const dispatchCalls: Array<Record<string, unknown>> = [];
    const dispatch: OmnichannelSalesFollowUpDispatch = async (_c, input) => {
      dispatchCalls.push(input as unknown as Record<string, unknown>);
      return {
        deliveryStatus: "sent",
        deliveryEventId: "evt-1",
        externalMessageId: "fake-wamid-1",
      } as Awaited<ReturnType<OmnichannelSalesFollowUpDispatch>>;
    };
    const delivery = createOmnichannelSalesFollowUpDelivery(ctx, { dispatch });

    const result = await delivery.deliver({
      companyId: "co-1",
      leadId: "lead-1",
      channel: "whatsapp",
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "201000000000",
      text: "Follow-up reminder",
      idempotencyKey: "co-1:lead-1:1:2026-10-20T00:00:00.000Z",
    });

    assert.equal(result.status, "delivered");
    assert.equal(result.providerMessageId, "fake-wamid-1");
    assert.equal(dispatchCalls.length, 1);
    assert.equal(dispatchCalls[0]?.text, "Follow-up reminder");
    assert.equal(
      (dispatchCalls[0]?.metadata as { source?: string } | undefined)?.source,
      "sales_follow_up",
    );
  });

  it("maps provider failure status to retryable failed without claiming delivered", async () => {
    let calls = 0;
    const dispatch: OmnichannelSalesFollowUpDispatch = async () => {
      calls += 1;
      return {
        deliveryStatus: "failed",
        deliveryEventId: "evt-fail",
        externalMessageId: null,
      } as Awaited<ReturnType<OmnichannelSalesFollowUpDispatch>>;
    };
    const delivery = createOmnichannelSalesFollowUpDelivery(ctx, { dispatch });

    const result = await delivery.deliver({
      companyId: "co-1",
      leadId: "lead-1",
      channel: "whatsapp",
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "201000000000",
      text: "Follow-up reminder",
      idempotencyKey: "co-1:lead-1:1:fail",
    });

    assert.equal(calls, 1);
    assert.equal(result.status, "failed");
    assert.equal(result.retryable, true);
    assert.match(String(result.error ?? ""), /failed/i);
  });
});
