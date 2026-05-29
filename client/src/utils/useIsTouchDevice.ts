import { useEffect, useState } from 'react';

/** Mobile heuristic: a touch-capable device whose primary pointer is coarse (excludes touch laptops). */
function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const hasTouchPoints = (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
  const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return hasTouchPoints && coarsePointer;
}

/** Reactive flag for whether on-screen touch controls should be shown. */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(detectTouchDevice);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(pointer: coarse)');
    const onChange = () => setIsTouch(detectTouchDevice());
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isTouch;
}
