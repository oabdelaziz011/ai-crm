import assert from "node:assert/strict";
import { PortalRateLimiter } from "../src/lib/customer-portal/security/portal-rate-limiter.ts";
import { PortalPaymentService } from "../src/lib/customer-portal/payments/portal-payment-service.ts";
import { evaluateCancellationPolicy, evaluateReschedulePolicy } from "../src/lib/scheduling/booking-domain/booking-policy.ts";
import { createCustomerTimelineService } from "../src/lib/customer-timeline/timeline-service.ts";

{
  const limiter = new PortalRateLimiter(3, 60_000);
  assert.equal(limiter.isAllowed("user1"), true);
  assert.equal(limiter.isAllowed("user1"), true);
  assert.equal(limiter.isAllowed("user1"), true);
  assert.equal(limiter.isAllowed("user1"), false);
  assert.equal(limiter.isAllowed("user2"), true);
}

{
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  assert.equal(evaluateCancellationPolicy(future, 60, new Date()), null);
  assert.ok(evaluateCancellationPolicy(past, 60, new Date()));
  assert.equal(evaluateReschedulePolicy(future, 30, new Date()), null);
}

{
  const payments = PortalPaymentService.createDefault();
  assert.ok(payments.getProvider("stripe"));
  assert.ok(payments.getProvider("paymob"));
  assert.ok(payments.getProvider("fawry"));
  assert.ok(payments.getProvider("sandbox"));

  const sandboxResult = await payments.createPayment("sandbox", {
    companyId: "c1",
    customerId: "cust1",
    invoiceId: "inv1",
    amountCents: 5000,
    currency: "USD",
    returnUrl: "https://example.com/return",
  });
  assert.equal(sandboxResult.provider, "sandbox");
  assert.ok(sandboxResult.checkoutUrl?.includes("inv1"));
}

{
  const timeline = createCustomerTimelineService();
  assert.equal(typeof timeline.buildTimeline, "function");
}

console.log("customer-portal.test.mts: all assertions passed");
