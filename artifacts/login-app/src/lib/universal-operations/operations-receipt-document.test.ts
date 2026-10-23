import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TFunction } from "i18next";
import {
  THERMAL_CONTENT_WIDTH_MM,
  THERMAL_PAGE_WIDTH_MM,
  THERMAL_SIDE_MARGIN_MM,
  buildOperationsReceiptHtml,
  groupPaymentsByMethod,
} from "./operations-receipt-document.ts";

const t = ((key: string) => key) as TFunction;

describe("thermal receipt document", () => {
  it("uses an 80mm roll with adjustable 72mm content", () => {
    assert.equal(THERMAL_PAGE_WIDTH_MM, 80);
    assert.equal(THERMAL_CONTENT_WIDTH_MM, 72);
    assert.equal(THERMAL_SIDE_MARGIN_MM, 4);
    const html = buildOperationsReceiptHtml(
      {
        dir: "rtl",
        accent: "#0f766e",
        companyName: "عيادات النور",
        receiptNo: "INV-14",
        bookingRef: "BK-000090",
        issuedAt: "13 أكتوبر 2026",
        customer: "عمر عبدالعزيز محمد فؤاد",
        service: "مدرس لغه عربيه",
        visitType: "جديد",
        appointment: "13 أكتوبر 2026، 9:00 ص",
        currency: "EGP",
        totalCents: 100,
        paidCents: 100,
        payments: [{ method: "cash", amountCents: 100, currency: "EGP" }],
      },
      t,
    );
    assert.match(html, /@page \{ size: 80mm auto; margin: 0; \}/);
    assert.match(html, /box-sizing: border-box/);
    assert.match(html, /width: 72mm/);
    assert.match(html, /padding: 4mm/);
    assert.match(html, /margin: 0/);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /عيادات النور/);
    assert.match(html, /universalOperations\.receipt\.booking/);
    assert.match(html, /BK-000090/);
    assert.match(html, /universalOperations\.receipt\.number/);
    assert.match(html, /INV-14/);
    assert.match(html, /overflow-wrap: anywhere/);
  });

  it("keeps the payable total separate from each payment method", () => {
    const grouped = groupPaymentsByMethod([
      { method: "cash", amountCents: 40, currency: "EGP" },
      { method: "Cash", amountCents: 10, currency: "EGP" },
      { method: "card", amountCents: 50, currency: "EGP" },
    ]);
    assert.deepEqual(
      grouped.map((row) => [row.method, row.amountCents]),
      [
        ["cash", 50],
        ["card", 50],
      ],
    );
    const html = buildOperationsReceiptHtml(
      {
        dir: "rtl",
        accent: "#0f766e",
        companyName: "عيادات النور",
        receiptNo: "INV-14",
        bookingRef: "BK-000090",
        issuedAt: "13 أكتوبر 2026",
        customer: "عمر",
        service: "عيادة",
        visitType: "استشارة",
        appointment: null,
        currency: "EGP",
        totalCents: 200,
        paidCents: 100,
        payments: [
          { method: "cash", amountCents: 60, currency: "EGP" },
          { method: "card", amountCents: 40, currency: "EGP" },
        ],
      },
      t,
    );
    assert.match(html, /universalOperations\.receipt\.total/);
    assert.match(html, /universalOperations\.payment\.methods\.cash/);
    assert.match(html, /universalOperations\.payment\.methods\.card/);
    assert.match(html, /universalOperations\.receipt\.paid/);
    assert.match(html, /universalOperations\.receipt\.balance/);
  });
});
