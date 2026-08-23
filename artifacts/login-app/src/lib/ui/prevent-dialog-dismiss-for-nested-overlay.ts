/**
 * Radix Dialog/Sheet DismissableLayer treats portaled Select/Popover/Menu/Calendar
 * content as "outside" the dialog. Two failure modes:
 *
 * 1) Direct: pointer/focus lands on a still-mounted nested overlay → prevent via closest().
 * 2) Race: Select/Popover unmounts on item choose before pointerup/click → event target is
 *    body/overlay, closest() fails, Dialog dismisses. Fix via a short grace window after
 *    nested-overlay pointer activity (set from Select/Popover/Menu content).
 *
 * @see https://github.com/radix-ui/primitives/issues/2121
 * @see https://github.com/radix-ui/primitives/issues/1836
 */

import type { FocusEvent as ReactFocusEvent, PointerEvent as ReactPointerEvent } from "react";

const NESTED_OVERLAY_SELECTOR = [
  "[data-radix-popper-content-wrapper]",
  "[data-radix-select-content]",
  "[data-radix-select-viewport]",
  "[data-radix-popover-content]",
  "[data-radix-dropdown-menu-content]",
  "[data-radix-dropdown-menu-sub-content]",
  "[data-radix-context-menu-content]",
  "[data-radix-menubar-content]",
  "[data-radix-hover-card-content]",
  "[data-radix-tooltip-content]",
  "[data-nested-ui-overlay]",
  "[role='listbox']",
  "[role='menu']",
  "[cmdk-root]",
  "[cmdk-list]",
  "[data-slot='select-content']",
  "[data-slot='popover-content']",
  "[data-slot='dropdown-menu-content']",
  ".rdp",
  ".rdp-root",
].join(",");

const OPEN_NESTED_OVERLAY_SELECTOR = [
  "[data-radix-select-content][data-state='open']",
  "[data-radix-popover-content][data-state='open']",
  "[data-radix-dropdown-menu-content][data-state='open']",
  "[data-radix-dropdown-menu-sub-content][data-state='open']",
  "[data-radix-context-menu-content][data-state='open']",
  "[data-radix-menubar-content][data-state='open']",
  "[data-radix-hover-card-content][data-state='open']",
  "[data-nested-ui-overlay][data-state='open']",
  "[data-radix-popper-content-wrapper]",
].join(",");

/** Grace window after nested overlay pointer activity (select-item unmount race). */
const NESTED_OVERLAY_GRACE_MS = 400;

/** Grace window after a dialog/sheet opens (double-click second click hitting overlay). */
const DIALOG_OPEN_GRACE_MS = 500;

let lastNestedOverlayActivityAt = 0;
let lastDialogSurfaceOpenedAt = 0;

function asElement(target: EventTarget | null | undefined): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

/** Call from Select/Popover/DropdownMenu content on pointer/focus activity. */
export function noteNestedOverlayActivity(): void {
  lastNestedOverlayActivityAt = Date.now();
}

/** Call when a dialog/sheet opens so the opening click cannot immediately dismiss it. */
export function noteDialogSurfaceOpened(): void {
  const now = Date.now();
  lastDialogSurfaceOpenedAt = now;
  lastNestedOverlayActivityAt = now;
}

export function isWithinNestedOverlayGracePeriod(now = Date.now()): boolean {
  return (
    now - lastNestedOverlayActivityAt < NESTED_OVERLAY_GRACE_MS ||
    now - lastDialogSurfaceOpenedAt < DIALOG_OPEN_GRACE_MS
  );
}

/** True when the event target lives inside a portaled nested overlay. */
export function isNestedOverlayTarget(target: EventTarget | null | undefined): boolean {
  const el = asElement(target);
  return Boolean(el?.closest(NESTED_OVERLAY_SELECTOR));
}

export function isAnyNestedOverlayOpen(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector(OPEN_NESTED_OVERLAY_SELECTOR));
}

type DismissableLayerLikeEvent = Event & {
  detail?: { originalEvent?: Event };
  relatedTarget?: EventTarget | null;
};

function collectEventTargets(event: Event): Array<EventTarget | null | undefined> {
  const layerEvent = event as DismissableLayerLikeEvent;
  const original = layerEvent.detail?.originalEvent as
    | (Event & { target?: EventTarget | null; relatedTarget?: EventTarget | null })
    | undefined;

  return [
    layerEvent.detail?.originalEvent?.target,
    original?.relatedTarget,
    layerEvent.relatedTarget,
    (event as FocusEvent).relatedTarget,
    event.target,
  ];
}

/**
 * Call from Dialog/Sheet/AlertDialog Content:
 * `onPointerDownOutside`, `onInteractOutside`, `onFocusOutside`, `onEscapeKeyDown`.
 */
export function preventDialogDismissForNestedOverlay(event: Event): void {
  if (collectEventTargets(event).some((candidate) => isNestedOverlayTarget(candidate))) {
    event.preventDefault();
    noteNestedOverlayActivity();
    return;
  }

  // Nested overlay still mounted (e.g. Select open, click on dialog chrome / overlay).
  if (isAnyNestedOverlayOpen()) {
    event.preventDefault();
    return;
  }

  // Select/Popover already unmounted after item choose; dismiss event target is body.
  if (isWithinNestedOverlayGracePeriod()) {
    event.preventDefault();
  }
}

type NestedOverlayPropBag = {
  "data-nested-ui-overlay": "";
  onPointerDownCapture: (event: ReactPointerEvent) => void;
  onFocusCapture: (event: ReactFocusEvent) => void;
  onCloseAutoFocus?: (event: Event) => void;
};

/**
 * Merge onto portaled overlay content roots so the grace window starts on interaction
 * even when the overlay unmounts before Dialog sees the event.
 */
export function withNestedOverlayGuard<T extends Record<string, unknown>>(
  props: T,
  options?: { preventCloseAutoFocus?: boolean },
): T & NestedOverlayPropBag {
  const userPointerDown = props.onPointerDownCapture as
    | ((event: ReactPointerEvent) => void)
    | undefined;
  const userFocus = props.onFocusCapture as ((event: ReactFocusEvent) => void) | undefined;
  const userCloseAutoFocus = props.onCloseAutoFocus as ((event: Event) => void) | undefined;

  return {
    ...props,
    "data-nested-ui-overlay": "",
    onPointerDownCapture: (event: ReactPointerEvent) => {
      noteNestedOverlayActivity();
      userPointerDown?.(event);
    },
    onFocusCapture: (event: ReactFocusEvent) => {
      noteNestedOverlayActivity();
      userFocus?.(event);
    },
    onCloseAutoFocus: (event: Event) => {
      noteNestedOverlayActivity();
      // Keep Dialog FocusScope stable after Select/Popover closes.
      if (options?.preventCloseAutoFocus !== false) {
        event.preventDefault();
      }
      userCloseAutoFocus?.(event);
    },
  };
}
