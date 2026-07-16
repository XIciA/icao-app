import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui';
import { colors, fonts, motion, radii, spacing } from '@/theme';

const THUMB_SIZE = 16;

export function formatAudioTime(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function AudioTimeline({
  accessibilityLabel = '播放进度',
  blockedExternalGesture,
  disabled = false,
  duration,
  formatValue = formatAudioTime,
  onInteractionChange,
  onScrubCancel,
  onScrubEnd,
  onScrubStart,
  position,
  showLabels = true,
  step,
  testID = 'audio-timeline',
}: {
  accessibilityLabel?: string;
  blockedExternalGesture?: GestureType;
  disabled?: boolean;
  duration: number;
  formatValue?: (value: number) => string;
  onInteractionChange?: (active: boolean) => void;
  onScrubCancel?: () => void;
  onScrubEnd: (position: number) => void | Promise<void>;
  onScrubStart?: () => void;
  position: number;
  showLabels?: boolean;
  step?: number;
  testID?: string;
}) {
  const [displayPosition, setDisplayPosition] = useState(position);
  const scrubbingRef = useRef(false);
  const progress = useSharedValue(duration > 0 ? position / duration : 0);
  const trackWidth = useSharedValue(0);
  const dragging = useSharedValue(0);
  const lastTextUpdate = useSharedValue(0);

  useEffect(() => {
    if (scrubbingRef.current) return;
    const next = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
    progress.value = next;
    setDisplayPosition(position);
  }, [duration, position, progress]);

  const reportPreview = useCallback((nextPosition: number) => {
    setDisplayPosition(nextPosition);
  }, []);

  const beginScrub = useCallback((nextPosition: number) => {
    scrubbingRef.current = true;
    setDisplayPosition(nextPosition);
    onInteractionChange?.(true);
    onScrubStart?.();
  }, [onInteractionChange, onScrubStart]);

  const finishScrub = useCallback((nextPosition: number) => {
    scrubbingRef.current = false;
    setDisplayPosition(nextPosition);
    onInteractionChange?.(false);
    void onScrubEnd(nextPosition);
  }, [onInteractionChange, onScrubEnd]);

  const cancelScrub = useCallback(() => {
    scrubbingRef.current = false;
    setDisplayPosition(position);
    onInteractionChange?.(false);
    onScrubCancel?.();
  }, [onInteractionChange, onScrubCancel, position]);

  const commitTap = useCallback((nextPosition: number) => {
    setDisplayPosition(nextPosition);
    void onScrubEnd(nextPosition);
  }, [onScrubEnd]);

  const gesture = useMemo(() => {
    const enabled = !disabled && duration > 0;
    const pan = Gesture.Pan()
      .enabled(enabled)
      .maxPointers(1)
      .activeOffsetX([-4, 4])
      .failOffsetY([-10, 10])
      .onStart(({ x }) => {
        const ratio = trackWidth.value > 0 ? Math.max(0, Math.min(1, x / trackWidth.value)) : progress.value;
        const rawPosition = ratio * duration;
        const nextPosition = step && step > 0 ? Math.round(rawPosition / step) * step : rawPosition;
        progress.value = duration > 0 ? nextPosition / duration : 0;
        dragging.value = 1;
        lastTextUpdate.value = Date.now();
        runOnJS(beginScrub)(nextPosition);
      })
      .onUpdate(({ x }) => {
        const ratio = trackWidth.value > 0 ? Math.max(0, Math.min(1, x / trackWidth.value)) : progress.value;
        const rawPosition = ratio * duration;
        const nextPosition = step && step > 0 ? Math.round(rawPosition / step) * step : rawPosition;
        progress.value = duration > 0 ? nextPosition / duration : 0;
        const now = Date.now();
        if (now - lastTextUpdate.value >= 50) {
          lastTextUpdate.value = now;
          runOnJS(reportPreview)(nextPosition);
        }
      })
      .onEnd(({ x }, success) => {
        if (!success) return;
        const ratio = trackWidth.value > 0 ? Math.max(0, Math.min(1, x / trackWidth.value)) : progress.value;
        const rawPosition = ratio * duration;
        const nextPosition = step && step > 0 ? Math.round(rawPosition / step) * step : rawPosition;
        progress.value = duration > 0 ? nextPosition / duration : 0;
        dragging.value = 0;
        runOnJS(finishScrub)(nextPosition);
      })
      .onFinalize((_event, success) => {
        if (success || dragging.value === 0) return;
        dragging.value = 0;
        progress.value = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
        runOnJS(cancelScrub)();
      })
      .withTestId(`${testID}-pan`);
    const tap = Gesture.Tap()
      .enabled(enabled)
      .maxDuration(300)
      .onEnd(({ x }, success) => {
        if (!success) return;
        const ratio = trackWidth.value > 0 ? Math.max(0, Math.min(1, x / trackWidth.value)) : progress.value;
        const rawPosition = ratio * duration;
        const nextPosition = step && step > 0 ? Math.round(rawPosition / step) * step : rawPosition;
        progress.value = duration > 0 ? nextPosition / duration : 0;
        runOnJS(commitTap)(nextPosition);
      })
      .withTestId(`${testID}-tap`);
    if (blockedExternalGesture) {
      pan.blocksExternalGesture(blockedExternalGesture);
      tap.blocksExternalGesture(blockedExternalGesture);
    }
    return Gesture.Race(pan, tap);
  }, [beginScrub, blockedExternalGesture, cancelScrub, commitTap, disabled, dragging, duration, finishScrub, lastTextUpdate, position, progress, reportPreview, step, testID, trackWidth]);

  const fillStyle = useAnimatedStyle(() => ({
    width: Math.max(0, progress.value * trackWidth.value),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.min(Math.max(0, trackWidth.value - THUMB_SIZE), Math.max(0, progress.value * trackWidth.value - THUMB_SIZE / 2)) },
      { scale: withTiming(dragging.value ? 1.18 : 1, { duration: motion.quick }) },
    ],
  }));

  function onTrackLayout(event: LayoutChangeEvent) {
    trackWidth.value = event.nativeEvent.layout.width;
  }

  const accessibilityStep = step && step > 0 ? step : duration <= 30 ? 1 : 5;

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          accessible
          accessibilityActions={[{ name: 'increment', label: '快进' }, { name: 'decrement', label: '后退' }]}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="adjustable"
          accessibilityState={{ disabled }}
          accessibilityValue={{
            max: Math.max(0, Math.round(duration)),
            min: 0,
            now: Math.max(0, Math.round(displayPosition)),
            text: `${formatValue(displayPosition)} / ${formatValue(duration)}`,
          }}
          onAccessibilityAction={(event) => {
            if (disabled || !duration) return;
            const delta = event.nativeEvent.actionName === 'increment' ? accessibilityStep : -accessibilityStep;
            const next = Math.max(0, Math.min(duration, displayPosition + delta));
            progress.value = duration > 0 ? next / duration : 0;
            setDisplayPosition(next);
            void onScrubEnd(next);
          }}
          onLayout={onTrackLayout}
          style={[styles.control, disabled ? styles.disabled : null]}
          testID={testID}
        >
          <View style={styles.trackBase} />
          <Animated.View style={[styles.fill, fillStyle]} />
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </Animated.View>
      </GestureDetector>
      {showLabels ? <View style={styles.timeRow}>
        <AppText style={styles.time} variant="micro">{formatValue(displayPosition)}</AppText>
        <AppText style={styles.time} variant="micro">{formatValue(duration)}</AppText>
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  control: { height: 44, justifyContent: 'center', position: 'relative' },
  trackBase: { backgroundColor: colors.border, borderRadius: radii.full, height: 6, left: 0, position: 'absolute', right: 0 },
  fill: { backgroundColor: colors.primary, borderRadius: radii.full, height: 6, left: 0, position: 'absolute' },
  thumb: { backgroundColor: colors.card, borderColor: colors.primary, borderRadius: radii.full, borderWidth: 2, height: THUMB_SIZE, left: 0, position: 'absolute', width: THUMB_SIZE },
  disabled: { opacity: 0.45 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -spacing[1] },
  time: { color: colors.mutedForeground, fontFamily: fonts.monoRegular },
});
