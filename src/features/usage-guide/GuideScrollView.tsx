import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, type ScrollViewProps, type View } from 'react-native';
import { useGuide } from './GuideBindings';
import { GuideScrollContext } from './guide-scroll-context';

/** Bring the current guide target into the real scroll viewport once per step. */
export function GuideScrollView({ children, onScroll, ...props }: ScrollViewProps) {
  const scroll = useRef<ScrollView>(null), offset = useRef(0), last = useRef('');
  const guide = useGuide();
  const activeStep = useRef(guide?.step); activeStep.current = guide?.step;
  useEffect(() => { last.current = ''; }, [guide?.step]);
  const reveal = useCallback((node: View, step: string) => {
    if (step !== activeStep.current || last.current === step) return;
    scroll.current?.getNativeScrollRef()?.measureInWindow((_x, y, _w, height) => {
      node.measureInWindow((_tx, ty, tw, th) => {
        if (step !== activeStep.current || !tw || !th || !height || last.current === step) return;
        last.current = step;
        if (ty < y + 140 || ty + Math.min(th, 80) > y + height - 120) {
          scroll.current?.scrollTo({ y: Math.max(0, offset.current + ty - y - 160), animated: true });
        }
      });
    });
  }, []);
  return <GuideScrollContext.Provider value={reveal}><ScrollView {...props} ref={scroll} scrollEventThrottle={16} onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; onScroll?.(event); }}>{children}</ScrollView></GuideScrollContext.Provider>;
}
