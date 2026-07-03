import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Drag-to-resize a side rail, clamped to [min, max], persisted to localStorage.
 * Listens on `window` (not the handle element) so the drag survives the cursor
 * outrunning a fast mouse move.
 */
export function useResizableRail(storageKey, min, max, defaultWidth) {
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(stored) && stored >= min && stored <= max) return stored;
    return defaultWidth;
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef({ startX: 0, startWidth: 0 });

  const startDrag = useCallback((e) => {
    dragState.current = { startX: e.clientX, startWidth: width };
    setIsDragging(true);
  }, [width]);

  useEffect(() => {
    if (!isDragging) return;

    function onMouseMove(e) {
      const delta = e.clientX - dragState.current.startX;
      // Rail sits on the right edge — dragging left grows it.
      const next = Math.min(max, Math.max(min, dragState.current.startWidth - delta));
      setWidth(next);
    }
    function onMouseUp() {
      setIsDragging(false);
      setWidth(current => {
        localStorage.setItem(storageKey, String(current));
        return current;
      });
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, min, max, storageKey]);

  return { width, isDragging, startDrag };
}
