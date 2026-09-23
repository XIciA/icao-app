import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useAudioPlayerStatus } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Headphones } from '@/components/ui/icons';
import { AppText, Button } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { audioSessionOrchestrator, useSessionManagedAudioPlayer, type AudioLease } from '@/platform/audio';
import { emitAudioDiagnostic } from '@/platform/audio/audio-diagnostics';
import { observeAudioInterruption } from '../../../../modules/icao-audio-interruption/src';

type Phase = 'loading' | 'playing' | 'paused' | 'ended' | 'error';
type Props = { exam?: boolean; autoPlay?: boolean; uri?: string; text?: string; label: string; resolving?: boolean; onRetry?: () => void; pauseRequest: number; onPlaybackStart?: () => void; practiceControls?: ReactNode };

/** Exam presentation of the shared study audio owner. No user transport controls. */
export function ExamQuestionAudio({ exam = true, autoPlay = true, uri, text, label, resolving, onRetry, pauseRequest, onPlaybackStart, practiceControls }: Props) {
  const player = useSessionManagedAudioPlayer(null, { updateInterval: 200, preferredForwardBufferDuration: 10 });
  const status = useAudioPlayerStatus(player);
  const [phase, setPhase] = useState<Phase>(autoPlay ? 'loading' : 'paused');
  const [interruptionReplay, setInterruptionReplay] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const lease = useRef<AudioLease | undefined>(undefined);
  const generation = useRef(0);
  const mounted = useRef(true);
  const appState = useRef(AppState.currentState ?? 'active');
  const phaseRef = useRef<Phase>(autoPlay ? 'loading' : 'paused');
  const audible = useRef(false);
  const playbackPosition = useRef(0);
  const wantPlay = useRef(autoPlay);
  const sourceReplacedStatus = useRef(status);
  const latestStatus = useRef(status);
  latestStatus.current = status;
  const speechStarted = useRef(false);
  const speechGeneration = useRef(0);
  const speechPaused = useRef(false);
  const interrupted = useRef(false);
  const eligibleForInterruption = useRef(false);
  const systemInterrupted = useRef(false);
  const awaitingReplay = useRef(false);
  const callbacks = useRef({ uri, text, resolving, onPlaybackStart });
  callbacks.current = { uri, text, resolving, onPlaybackStart };
  const operations = useRef({ play: (_restart = false) => {}, pause: () => {} });

  function fail(code: string) {
    emitAudioDiagnostic({ scope: 'playback', owner: 'study', level: 'error', code, reason: 'exam-question', phase: phaseRef.current });
    update('error');
  }
  function update(next: Phase) { phaseRef.current = next; if (mounted.current) setPhase(next); }
  function releaseSpecific(current: AudioLease | undefined) {
    if (!current) return;
    if (lease.current?.token === current.token && lease.current.owner === current.owner) lease.current = undefined;
    void audioSessionOrchestrator.release(current).catch(() => undefined);
  }
  function release() { releaseSpecific(lease.current); }
  function pause() {
    generation.current += 1;
    wantPlay.current = false;
    try { if (player.currentTime > 0) playbackPosition.current = player.currentTime; player.pause(); } catch { /* Released or unavailable media still allows exit. */ }
    if (speechStarted.current) { speechPaused.current = true; void Speech.pause().catch(() => { speechPaused.current = false; }); }
    release();
    if (phaseRef.current !== 'ended') update('paused');
  }
  async function play(restart = false) {
    if (callbacks.current.resolving || appState.current !== 'active' || (systemInterrupted.current || (awaitingReplay.current && !restart))) return;
    if (callbacks.current.uri && !latestStatus.current.isLoaded) { wantPlay.current = true; update('loading'); return; }
    wantPlay.current = false;
    const request = ++generation.current;
    let acquired: AudioLease | undefined;
    try {
      acquired = await audioSessionOrchestrator.acquire('study', 'exam-question');
      if (!mounted.current || request !== generation.current || appState.current !== 'active') { await audioSessionOrchestrator.release(acquired); return; }
      lease.current = acquired;
      if (restart) {
        playbackPosition.current = 0;
        if (speechStarted.current) { speechGeneration.current += 1; speechPaused.current = false; await Speech.stop(); speechStarted.current = false; }
      }
      if (!mounted.current || request !== generation.current) { releaseSpecific(acquired); return; }
      eligibleForInterruption.current = true;
      // File playback uses the same session owner as ordinary study. Only this
      // component's own TTS may be stopped; unrelated speech is not a prerequisite.
      if (!mounted.current || request !== generation.current) { releaseSpecific(acquired); return; }
      callbacks.current.onPlaybackStart?.();
      if (callbacks.current.uri) {
        if (restart || playbackPosition.current > 0) await player.seekTo(playbackPosition.current);
        if (!mounted.current || request !== generation.current) { releaseSpecific(acquired); return; }
        player.setPlaybackRate(1);
        player.play();
        update('playing');
      } else if (callbacks.current.text?.trim()) {
        if (speechPaused.current && !restart) {
          await Speech.resume();
          if (!mounted.current || request !== generation.current) { releaseSpecific(acquired); return; }
          speechPaused.current = false; update('playing');
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
    } catch (error) {
      if (mounted.current && request === generation.current) fail(error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'exam_play_start_failed');
      releaseSpecific(acquired);
    }
  }
  operations.current = { play: (restart = false) => { void play(restart); }, pause };

  useEffect(() => {
    mounted.current = true;
    const unregister = audioSessionOrchestrator.register('study', { deactivate: async () => {
      operations.current.pause();
      interrupted.current = false; eligibleForInterruption.current = false; awaitingReplay.current = false; setInterruptionReplay(false);
      if (speechStarted.current) { speechPaused.current = false; speechGeneration.current += 1; await Speech.stop(); }
    } });
    const subscription = observeAudioInterruption(event => {
      if (event.phase === 'began') {
        systemInterrupted.current = true;
        if (!eligibleForInterruption.current || !['playing', 'paused'].includes(phaseRef.current)) return;
        interrupted.current = true;
        awaitingReplay.current = true;
        setInterruptionReplay(false);
        operations.current.pause();
      } else {
        systemInterrupted.current = false;
        if (interrupted.current && awaitingReplay.current && eligibleForInterruption.current) setInterruptionReplay(true);
      }
    });
    const appSubscription = AppState.addEventListener('change', next => {
      appState.current = next;
      if (next !== 'active' && (phaseRef.current === 'playing' || phaseRef.current === 'loading')) { interrupted.current = true; operations.current.pause(); }
      else if (next === 'active' && interrupted.current && !awaitingReplay.current) { interrupted.current = false; operations.current.play(); }
      else if (next === 'active' && phaseRef.current === 'loading') { wantPlay.current = true; setLoadAttempt(value => value + 1); }
    });
    return () => { mounted.current = false; unregister(); subscription.remove(); appSubscription.remove(); generation.current += 1; try { player.pause(); } catch { /* Player disposed. */ } speechGeneration.current += 1; if (speechStarted.current) void Speech.stop().catch(() => undefined); release(); };
  // One instance is mounted for each immutable exam item. Callbacks use refs.
   
  }, [player]);

  useEffect(() => {
    if (resolving) {
      // A catalog/fallback path is not yet the authorized playback source.
      // Keep automatic playback queued until the shared asset loader finishes.
      wantPlay.current = wantPlay.current || phaseRef.current === 'playing';
      if (wantPlay.current) update('loading');
      return;
    }
    if (!uri) return;
    sourceReplacedStatus.current = status;
    try {
      wantPlay.current = wantPlay.current || phaseRef.current === 'playing';
      player.replace(uri);
      update(wantPlay.current ? 'loading' : 'paused');
    } catch { fail('exam_source_replace_failed'); }
  // Source updates refresh the same immutable question, preserving elapsed time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, uri, resolving, loadAttempt]);
  useEffect(() => {
    if (resolving || !uri || status === sourceReplacedStatus.current) return;
    if (uri && wantPlay.current && status !== sourceReplacedStatus.current && status.isLoaded && status.playbackState !== 'error') operations.current.play();
    if (status.currentTime > 0) { audible.current = true; playbackPosition.current = status.currentTime; }
    if (awaitingReplay.current && status.playing) { try { player.pause(); } catch { /* Interruption is already paused. */ } }
    if (uri && status.didJustFinish && phaseRef.current === 'playing') { eligibleForInterruption.current = false; update('ended'); release(); }
    if (uri && status.playbackState === 'error' && phaseRef.current !== 'error') { operations.current.pause(); eligibleForInterruption.current = false; fail('exam_media_load_failed'); }
  // The player status drives readiness; transports are stable per item.
   
  }, [player, status, uri, resolving]);
  useEffect(() => { if (!uri && text?.trim() && wantPlay.current && !resolving) operations.current.play(); }, [uri, text, resolving, loadAttempt]);
  useEffect(() => {
    // Signed URL resolution has its own timeout and retry path. The
    // player's 15-second startup watchdog only begins once media is resolved.
    if (resolving || (phase !== 'loading' && !(phase === 'playing' && !audible.current))) return;
    const timer = setTimeout(() => { if (phaseRef.current === 'loading' || (phaseRef.current === 'playing' && !audible.current)) { operations.current.pause(); eligibleForInterruption.current = false; if (speechStarted.current) { speechGeneration.current += 1; void Speech.stop().catch(() => undefined); } fail('exam_first_frame_timeout'); } }, 15_000);
    return () => clearTimeout(timer);
  }, [phase, loadAttempt, resolving]);
  const previousPauseRequest = useRef(pauseRequest);
  useEffect(() => {
    if (pauseRequest === previousPauseRequest.current) return;
    previousPauseRequest.current = pauseRequest;
    operations.current.pause(); eligibleForInterruption.current = false; interrupted.current = false; awaitingReplay.current = false; setInterruptionReplay(false);
    if (speechStarted.current) { speechPaused.current = false; speechGeneration.current += 1; void Speech.stop().catch(() => undefined); }
  }, [pauseRequest]);

  const canRetry = phase === 'error' && (!exam || !audible.current);
  const labelText = phase === 'loading' ? '正在准备音频…' : phase === 'playing' ? '音频播放中' : phase === 'ended' ? '音频已播放' : interruptionReplay ? '音频已中断，可重播本题音频' : phase === 'error' ? '音频暂不可用，可继续作答或进入下一题' : '音频已中断，可继续作答或进入下一题';
  return <View style={styles.root}><View style={styles.row}><Headphones color={colors.mutedForeground} size={17} /><AppText variant="caption">{label}</AppText></View>
    <AppText accessibilityLiveRegion="polite" variant="caption">{labelText}</AppText>
    {!exam ? <Button size="sm" variant="outline" onPress={() => { if (phase === 'playing') { eligibleForInterruption.current = false; operations.current.pause(); } else { awaitingReplay.current = false; interrupted.current = false; setInterruptionReplay(false); operations.current.play(phase === 'ended' || phase === 'error' || interruptionReplay); } }}>{phase === 'playing' ? '暂停' : phase === 'ended' ? '重新播放' : '播放题目'}</Button> : null}
    {interruptionReplay && exam ? <Button size="sm" variant="outline" onPress={() => { if (appState.current !== 'active' || systemInterrupted.current) return; awaitingReplay.current = false; interrupted.current = false; setInterruptionReplay(false); operations.current.play(true); }}>重播本题音频</Button> : null}
    {canRetry ? <Button size="sm" variant="outline" onPress={() => { onRetry?.(); wantPlay.current = true; update('loading'); setLoadAttempt(value => value + 1); }}>重新加载音频</Button> : null}
    {practiceControls}
  </View>;
}
const styles = StyleSheet.create({ root: { gap: spacing[3] }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] } });
