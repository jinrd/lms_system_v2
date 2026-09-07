import { useEffect, type RefObject } from "react";

/** Keep keyboard navigation inside an open overlay and restore its trigger. */
export function useFocusContainment(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const container = ref.current;
    if (!active || !container) return;
    const previous = document.activeElement;
    container.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(container.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0 && !element.closest('[inert]'));
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) {
        event.preventDefault();
        container.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === container)) {
        event.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [active, ref]);
}
