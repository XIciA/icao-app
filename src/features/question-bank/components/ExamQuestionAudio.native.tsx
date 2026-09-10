import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useAudioPlayerStatus } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Headphones } from '@/components/ui/icons';
import { AppText, Button } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { audioSessionOrchestrator, useSessionManagedAudioPlayer, type AudioLease } from '@/platform/audio';
import { observeAudioInterruption } from '../../../../modules/icao-audio-interruption/src';

type Phase = 'loading' | 'playing' | 'paused' | 'ended' | 'error';
type Props = { exam?: boolean; autoPlay?: boolean; uri?: string; text?: string; label: string; resolving?: boolean; onRetry?: () => void; pauseRequest: number; onPlaybackStart?: () => void; practiceControls?: ReactNode };

/** Exam presentation of the shared study audio owner. No user transport controls. */
export function ExamQuestionAudio({ exam = true, autoPlay = true, uri, text, label, resolving, onRetry, pauseRequest, onPlaybackStart, practiceControls }: Props) {
  const player = useSessionManagedAudioPlayer(null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [phase, setPhase] = useState<Phase>(autoPlay ? 'loading' : 'paused');
  const [callReplay, setCallReplay] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const lease = useRef<AudioLease | undefined>(undefined);
  const generation = useRef(0);
  const mounted = useRef(true);
  const appState = useRef(AppState.currentState);
  const phaseRef = useRef<Phase>(autoPlay ? 'loading' : 'paused');
  const audible = useRef(false);
  const playbackPosition = useRef(0);
  const wantPlay = useRef(autoPlay);
  const sourceReplacedStatus = useRef(status);
  const speechStarted = useRef(false);
  const speechGeneration = useRef(0);
  const speechPaused = useRef(false);
  const replayUsed = useRef(false);
  const interrupted = useRef(false);
  const eligibleForInterruption = useRef(false);
  const interruptedByCall = useRef(false);
  const callWaiting = useRef(false);
  const callbacks = useRef({ uri, text, resolving, onPlaybackStart });
  callbacks.current = { uri, text, resolving, onPlaybackStart };
  const operations = useRef({ play: (_restart = false) => {}, pause: () => {} });

  function update(next: Phase) { phaseRef.current = next; if (mounted.current) setPhase(next); }
  function release() { const current = lease.current; lease.current = undefined; if (current) void audioSessionOrchestrator.release(current).catch(() => undefined); }
  function pause() {
    generation.current += 1;
    wantPlay.current = false;
    try { if (player.currentTime > 0) playbackPosition.current = player.currentTime; player.pause(); } catch { /* Released or unavailable media still allows exit. */ }
    if (speechStarted.current) { speechPaused.current = true; void Speech.pause().catch(() => { speechPaused.current = false; }); }
    release();
    if (phaseRef.current !== 'ended') update('paused');
  }
  async function play(restart = false) {
    if (callbacks.current.resolving || appState.current !== 'active' || (callWaiting.current && !restart)) return;
    wantPlay.current = false;
    const request = ++generation.current;
    let acquired: AudioLease | undefined;
    try {
      acquired = await audioSessionOrchestrator.acquire('study', 'exam-question');
      if (!mounted.current || request !== generation.current || appState.current !== 'active') { await audioSessionOrchestrator.release(acquired); return; }
      lease.current = acquired;
      if (restart) { speechGeneration.current += 1; playbackPosition.current = 0; speechPaused.current = false; speechGeneration.current += 1; await Speech.stop(); }
      if (!mounted.current || request !== generation.current) { release(); return; }
      eligibleForInterruption.current = true;
      if (!speechPaused.current) await Speech.stop();
      if (!mounted.current || request !== generation.current) { release(); return; }
      callbacks.current.onPlaybackStart?.();
      if (callbacks.current.uri) {
        if (restart || playbackPosition.current > 0) await player.seekTo(playbackPosition.current);
        if (!mounted.current || request !== generation.current) { release(); return; }
        player.playbackRate = 1;
        player.play();
        update('playing');
      } else if (callbacks.current.text?.trim()) {
        if (speechPaused.current && !restart) {
          await Speech.resume(); speechPaused.current = false; update('playing');
        } else {
          speechStarted.current = true;
          const utterance = ++speechGeneration.current;
          Speech.speak(callbacks.current.text.trim(), {
            language: 'en-US', rate: 0.91, pitch: 1, useApplicationAudioSession: true,
            onStart: () => { if (utterance === speechGeneration.current) { audible.current = true; if (phaseRef.current !== 'paused') update('playing'); else void Speech.pause().catch(() => undefined); } },
            onDone: () => { if (utterance === speechGeneration.current) { eligibleForInterruption.current = false; update('ended'); release(); } },
            onError: () => { if (utterance === speechGeneration.current) { update('error'); release(); } },
          });
          update('playing');
        }
      } else { update('error'); release(); }
    } catch { if (request === generation.current) update('error'); if (acquired) void audioSessionOrchestrator.release(acquired).catch(() => undefined); }
  }
  operations.current = { play: (restart = false) => { void play(restart); }, pause };

  useEffect(() => {
    mounted.current = true;
    const unregister = audioSessionOrchestrator.register('study', { deactivate: async () => {
      operations.current.pause();
      interrupted.current = false; eligibleForInterruption.current = false;
      if (speechStarted.current) { speechPaused.current = false; speechGeneration.current += 1; await Speech.stop(); }
    } });
    const subscription = observeAudioInterruption(event => {
      if (event.phase === 'began') {
        if (!eligibleForInterruption.current || !['playing', 'paused'].includes(phaseRef.current) || (!audible.current && phaseRef.current !== 'playing')) return;
        interrupted.current = true;
        interruptedByCall.current ||= event.isCall;
        if (event.isCall) callWaiting.current = true;
        operations.current.pause();
      } else if (interrupted.current) {
        interruptedByCall.current ||= event.isCall;
        if (interruptedByCall.current && !replayUsed.current) { callWaiting.current = true; setCallReplay(true); }
        else if (!interruptedByCall.current && appState.current === 'active') { interrupted.current = false; operations.current.play(); }
      }
    });
    const appSubscription = AppState.addEventListener('change', next => {
      appState.current = next;
      if (next !== 'active' && phaseRef.current === 'playing') { interrupted.current = true; operations.current.pause(); }
      else if (next === 'active' && interrupted.current && !callWaiting.current) { interrupted.current = false; operations.current.play(); }
      else if (next === 'active' && phaseRef.current === 'loading') { wantPlay.current = true; setLoadAttempt(value => value + 1); }
    });
    return () => { mounted.current = false; unregister(); subscription.remove(); appSubscription.remove(); generation.current += 1; try { player.pause(); } catch { /* Player disposed. */ } speechGeneration.current += 1; if (speechStarted.current) void Speech.stop().catch(() => undefined); release(); };
  // One instance is mounted for each immutable exam item. Callbacks use refs.
   
  }, [player]);

  useEffect(() => {
    if (resolving) {
      // A catalog/fallback path is not yet the authorized playback source.
      // Keep automatic playback queued until the shared asset loader finishes.
      wantPlay.current = autoPlay || audible.current;
      if (wantPlay.current) update('loading');
      return;
    }
    if (!uri) return;
    sourceReplacedStatus.current = status;
    try { player.replace(uri); wantPlay.current = autoPlay || audible.current; update(wantPlay.current ? 'loading' : 'paused'); } catch { update('error'); }
  // Source updates refresh the same immutable question, preserving elapsed time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, uri, resolving, loadAttempt]);
  useEffect(() => {
    if (resolving || !uri || status === sourceReplacedStatus.current) return;
    if (uri && wantPlay.current && status !== sourceReplacedStatus.current && status.isLoaded && status.playbackState !== 'error') operations.current.play();
    if (status.currentTime > 0) { audible.current = true; playbackPosition.current = status.currentTime; }
    if (callWaiting.current && status.playing) { try { player.pause(); } catch { /* Interruption is already paused. */ } }
    if (uri && status.didJustFinish && phaseRef.current === 'playing') { eligibleForInterruption.current = false; update('ended'); release(); }
    if (uri && status.playbackState === 'error' && phaseRef.current !== 'error') { operations.current.pause(); eligibleForInterruption.current = false; update('error'); }
  // The player status drives readiness; transports are stable per item.
   
  }, [player, status, uri, resolving]);
  useEffect(() => { if (!uri && text?.trim() && wantPlay.current && !resolving) operations.current.play(); }, [uri, text, resolving, loadAttempt]);
  useEffect(() => {
    // Signed URL resolution has its own timeout and retry path. The
    // player's 15-second startup watchdog only begins once media is resolved.
    if (resolving || (phase !== 'loading' && !(phase === 'playing' && !audible.current))) return;
    const timer = setTimeout(() => { if (phaseRef.current === 'loading' || (phaseRef.current === 'playing' && !audible.current)) { operations.current.pause(); eligibleForInterruption.current = false; if (speechStarted.current) { speechGeneration.current += 1; void Speech.stop().catch(() => undefined); } update('error'); } }, 15_000);
    return () => clearTimeout(timer);
  }, [phase, loadAttempt, resolving]);
  const previousPauseRequest = useRef(pauseRequest);
  useEffect(() => {
    if (pauseRequest === previousPauseRequest.current) return;
    previousPauseRequest.current = pauseRequest;
    operations.current.pause(); eligibleForInterruption.current = false; interrupted.current = false; callWaiting.current = false; setCallReplay(false);
    if (speechStarted.current) { speechPaused.current = false; speechGeneration.current += 1; void Speech.stop().catch(() => undefined); }
  }, [pauseRequest]);

  const canRetry = phase === 'error' && (!exam || !audible.current);
  const labelText = phase === 'loading' ? '正在准备音频…' : phase === 'playing' ? '音频播放中' : phase === 'ended' ? '音频已播放' : callReplay ? '通话已结束，可重播一次本题音频' : phase === 'error' ? '音频暂不可用，可继续作答或进入下一题' : '音频已中断，可继续作答或进入下一题';
  return <View style={styles.root}><View style={styles.row}><Headphones color={colors.mutedForeground} size={17} /><AppText variant="caption">{label}</AppText></View>
    <AppText accessibilityLiveRegion="polite" variant="caption">{labelText}</AppText>
    {!exam ? <Button size="sm" variant="outline" onPress={() => { if (phase === 'playing') { eligibleForInterruption.current = false; operations.current.pause(); } else operations.current.play(phase === 'ended' || phase === 'error'); }}>{phase === 'playing' ? '暂停' : phase === 'ended' ? '重新播放' : '播放题目'}</Button> : null}
    {callReplay && exam ? <Button size="sm" variant="outline" onPress={() => { if (replayUsed.current || appState.current !== 'active') return; replayUsed.current = true; callWaiting.current = false; interrupted.current = false; interruptedByCall.current = false; setCallReplay(false); operations.current.play(true); }}>重播本题音频</Button> : null}
    {canRetry ? <Button size="sm" variant="outline" onPress={() => { onRetry?.(); wantPlay.current = true; update('loading'); setLoadAttempt(value => value + 1); }}>重新加载音频</Button> : null}
    {practiceControls}
  </View>;
}
const styles = StyleSheet.create({ root: { gap: spacing[3] }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] } });
