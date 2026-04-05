import { useRef, useCallback } from 'react';

/**
 * Disambiguates single-click from double-click on the same element.
 * Single-click fires after `delay` ms if no second click arrives.
 * Double-click fires immediately and cancels the pending single-click.
 */
export function useDoubleClick(
  onSingle: () => void,
  onDouble: () => void,
  delay = 250,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countRef = useRef(0);

  return useCallback(() => {
    countRef.current += 1;

    if (countRef.current === 1) {
      timerRef.current = setTimeout(() => {
        if (countRef.current === 1) onSingle();
        countRef.current = 0;
      }, delay);
    } else if (countRef.current >= 2) {
      if (timerRef.current) clearTimeout(timerRef.current);
      countRef.current = 0;
      onDouble();
    }
  }, [onSingle, onDouble, delay]);
}
