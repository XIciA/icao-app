import { useLayoutEffect, useRef } from 'react';

/** Closing overlays render their last committed presentation, not cleared data. */
export function useLastVisibleValue<T>(visible: boolean, value: T): T {
  const lastVisible = useRef(value);
  useLayoutEffect(() => { if (visible) lastVisible.current = value; }, [value, visible]);
  return visible ? value : lastVisible.current;
}
