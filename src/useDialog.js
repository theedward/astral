import { useEffect, useRef } from 'react';
export default function useDialog(open, onClose) {
  const ref = useRef(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const focusables = () =>
      [
        ...(ref.current?.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
        ) || []),
      ].filter((e) => e.offsetParent !== null);
    focusables()[0]?.focus();
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        close.current();
      }
      if (e.key === 'Tab') {
        const items = focusables();
        if (!items.length) {
          e.preventDefault();
          return;
        }
        const index = items.indexOf(document.activeElement);
        if (e.shiftKey && index <= 0) {
          e.preventDefault();
          items.at(-1).focus();
        } else if (!e.shiftKey && (index === items.length - 1 || index < 0)) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
      previous?.focus?.();
    };
  }, [open]);
  return ref;
}
