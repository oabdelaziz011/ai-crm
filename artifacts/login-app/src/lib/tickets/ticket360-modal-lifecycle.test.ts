import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldIgnoreTicket360Dismiss,
  shouldResetTicket360Session,
} from "./ticket360-modal-lifecycle.ts";

describe("ticket360 modal lifecycle", () => {
  it("does not close on successful status mutation dismiss race (nested overlay grace)", () => {
    assert.equal(
      shouldIgnoreTicket360Dismiss({
        nextOpen: false,
        nestedOverlayOpen: false,
        withinNestedOverlayGrace: true,
        mutationPending: false,
      }),
      true,
    );
  });

  it("does not close while status/priority/comment mutation is pending", () => {
    assert.equal(
      shouldIgnoreTicket360Dismiss({
        nextOpen: false,
        nestedOverlayOpen: false,
        withinNestedOverlayGrace: false,
        mutationPending: true,
      }),
      true,
    );
  });

  it("does not close while a nested select/menu is still open", () => {
    assert.equal(
      shouldIgnoreTicket360Dismiss({
        nextOpen: false,
        nestedOverlayOpen: true,
        withinNestedOverlayGrace: false,
        mutationPending: false,
      }),
      true,
    );
  });

  it("allows explicit close when overlays are idle and no mutation is pending", () => {
    assert.equal(
      shouldIgnoreTicket360Dismiss({
        nextOpen: false,
        nestedOverlayOpen: false,
        withinNestedOverlayGrace: false,
        mutationPending: false,
      }),
      false,
    );
  });

  it("never ignores open=true", () => {
    assert.equal(
      shouldIgnoreTicket360Dismiss({
        nextOpen: true,
        nestedOverlayOpen: true,
        withinNestedOverlayGrace: true,
        mutationPending: true,
      }),
      false,
    );
  });

  it("preserves session (tab) across mutations: open stays true, same ticket", () => {
    assert.equal(
      shouldResetTicket360Session({
        open: true,
        ticketId: "t1",
        wasOpen: true,
        previousTicketId: "t1",
      }),
      false,
    );
  });

  it("resets session when modal newly opens", () => {
    assert.equal(
      shouldResetTicket360Session({
        open: true,
        ticketId: "t1",
        wasOpen: false,
        previousTicketId: "t1",
      }),
      true,
    );
  });

  it("resets session when selected ticket identity changes", () => {
    assert.equal(
      shouldResetTicket360Session({
        open: true,
        ticketId: "t2",
        wasOpen: true,
        previousTicketId: "t1",
      }),
      true,
    );
  });

  it("does not reset when modal is closed", () => {
    assert.equal(
      shouldResetTicket360Session({
        open: false,
        ticketId: "t1",
        wasOpen: true,
        previousTicketId: "t1",
      }),
      false,
    );
  });
});
