"use client";

import { useEffect, useRef, type RefObject } from "react";

const dialogs = 'dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]';
const controls = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Only the frontmost dialog handles Escape and contains keyboard focus. */
export function bindDialogFocus(box: HTMLElement, onClose: () => void) {
  const previous = document.activeElement;
  const visible = (node: HTMLElement) => node.getClientRects().length > 0 && !node.closest('[inert], [hidden]');
  const isTop = () => Array.from(document.querySelectorAll<HTMLElement>(dialogs)).filter(visible).at(-1) === box;
  const focusable = () => Array.from(box.querySelectorAll<HTMLElement>(controls)).filter(visible);
  const focusFirst = () => (box.querySelector<HTMLElement>('[data-dialog-initial-focus]') ?? focusable()[0] ?? box).focus();
  if (isTop()) focusFirst();
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !isTop()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    } else if (event.key === "Tab") {
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !box.contains(document.activeElement) || document.activeElement === box ||
        (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last ?? box : first ?? box).focus();
      }
    }
  };
  const onFocus = (event: FocusEvent) => {
    if (isTop() && event.target instanceof Node && !box.contains(event.target)) focusFirst();
  };
  document.addEventListener("keydown", onKey);
  document.addEventListener("focusin", onFocus);
  return () => {
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("focusin", onFocus);
    if (previous instanceof HTMLElement && previous.isConnected &&
      (box.contains(document.activeElement) || document.activeElement === document.body)) previous.focus();
  };
}

export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    if (active && ref.current) return bindDialogFocus(ref.current, () => close.current());
  }, [active, ref]);
}
