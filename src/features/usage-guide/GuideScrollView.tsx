import { forwardRef, useCallback, useEffect, useRef } from 'react';
import { ScrollView, type ScrollViewProps, type View } from 'react-native';
import { useGuide } from './GuideBindings';
import { GuideScrollContext } from './guide-scroll-context';

/** Reveal an actual target once, preserving the caller's scroll owner and events. */
export const GuideScrollView = forwardRef<ScrollView, ScrollViewProps>(function GuideScrollView({ children, onScroll, ...props }, forwarded) {
  const scroll = useRef<ScrollView>(null), offset = useRef(0), last = useRef<View | undefined>(undefined);
  const guide = useGuide();
  const activeTarget = useRef(guide?.target); activeTarget.current = guide?.target;
  useEffect(() => { last.current = undefined; }, [guide?.step]);
  const reveal = useCallback((node: View, target: string) => {
    if (target !== activeTarget.current || last.current === node) return;
    scroll.current?.getNativeScrollRef()?.measureInWindow((_x, y, _w, height) => node.measureInWindow((_tx, ty, tw, th) => {
      if (target !== activeTarget.current || !tw || !th || !height || last.current === node) return;
      last.current = node;
      if (ty < y + 60 || ty + Math.min(th, 80) > y + height - 80) scroll.current?.scrollTo({ y: Math.max(0, offset.current + ty - y - 100), animated: true });
    }));
  }, []);
  return <GuideScrollContext.Provider value={guide?.current ? reveal : null}><ScrollView {...props} ref={view => {
    scroll.current = view;
    if (typeof forwarded === 'function') forwarded(view); else if (forwarded) forwarded.current = view;
  }} scrollEventThrottle={props.scrollEventThrottle ?? 16} onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; onScroll?.(event); }}>{children}</ScrollView></GuideScrollContext.Provider>;
});
