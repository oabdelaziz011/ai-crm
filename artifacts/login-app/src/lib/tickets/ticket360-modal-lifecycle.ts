/**
 * Pure Ticket 360 modal lifecycle helpers (no React / no I/O).
 * Prevents accidental dismiss when nested Select/Menu overlays close or mutations are pending.
 */

export type Ticket360DismissGuardInput = {
  nextOpen: boolean;
  nestedOverlayOpen: boolean;
  withinNestedOverlayGrace: boolean;
  mutationPending: boolean;
};

/**
 * Returns true when a request to close Ticket 360 should be ignored.
 * Explicit user close (X / menu) goes through onClose → onOpenChange(false) with overlays closed
 * and no pending mutation, so it is not ignored.
 */
export function shouldIgnoreTicket360Dismiss(input: Ticket360DismissGuardInput): boolean {
  if (input.nextOpen) return false;
  if (input.mutationPending) return true;
  if (input.nestedOverlayOpen) return true;
  if (input.withinNestedOverlayGrace) return true;
  return false;
}

export type Ticket360SessionResetInput = {
  open: boolean;
  ticketId: string | null;
  wasOpen: boolean;
  previousTicketId: string | null;
};

/** Reset tab/composer when the modal newly opens or the selected ticket identity changes. */
export function shouldResetTicket360Session(input: Ticket360SessionResetInput): boolean {
  if (!input.open || !input.ticketId) return false;
  const newlyOpened = !input.wasOpen;
  const ticketChanged = input.ticketId !== input.previousTicketId;
  return newlyOpened || ticketChanged;
}
