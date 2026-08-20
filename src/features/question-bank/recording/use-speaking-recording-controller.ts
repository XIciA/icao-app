import { createElement, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { audioSessionOrchestrator } from '@/platform/audio';

import { useExpoRecorderAdapter } from './expo-recorder-adapter';
import { RecordingEngine, type RecordingEngineSnapshot } from './recording-engine';
import { recordingRepository } from './recording-repository';
import type { RecorderPort, RecordingAsset } from './types';

export type SpeakingRecordingController = RecordingEngineSnapshot & {
  beginReplacement: () => void;
  cancelPermissionPrimer: () => Promise<void>;
  cancelReplacement: () => void;
  clear: () => void;
  dismissCompatibility: () => void;
  permissionDenied: boolean;
  pressIn: () => void;
  pressOut: () => Promise<void>;
  primePermission: () => Promise<void>;
  retryPermission: () => Promise<void>;
};

type SpeakingRecordingControllerHostProps = {
  cardId: string;
  children: (controller: SpeakingRecordingController) => ReactNode;
  onClear: () => void;
  onInteractionChange?: (active: boolean) => void;
  onRecorded: (recording: RecordingAsset) => void;
  recording?: RecordingAsset;
  sessionId: string;
};

function useSpeakingRecordingController(engine: RecordingEngine): SpeakingRecordingController {
  const snapshot = useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.getSnapshot(),
    () => engine.getSnapshot(),
  );
  return {
    ...snapshot,
    beginReplacement: engine.beginReplacement,
    cancelPermissionPrimer: engine.cancelPermissionPrimer,
    cancelReplacement: engine.cancelReplacement,
    clear: engine.clear,
    dismissCompatibility: engine.dismissCompatibility,
    permissionDenied: snapshot.error?.code === 'microphone_permission_denied',
    pressIn: engine.pressIn,
    pressOut: engine.pressOut,
    primePermission: engine.primePermission,
    retryPermission: engine.retryPermission,
  };
}

function RecordingRuntimeHost({
  children,
  engine,
  runtimeEpoch,
}: {
  children?: ReactNode;
  engine: RecordingEngine;
  runtimeEpoch: number;
}) {
  const currentRuntime = useExpoRecorderAdapter();
  const currentRuntimeRef = useRef(currentRuntime);
  currentRuntimeRef.current = currentRuntime;
  const stableRuntimeRef = useRef<RecorderPort | undefined>(undefined);
  if (!stableRuntimeRef.current) {
    stableRuntimeRef.current = {
      cancel: (context) => currentRuntimeRef.current.cancel(context),
      dispose: () => currentRuntimeRef.current.dispose(),
      get isWeb() { return currentRuntimeRef.current.isWeb; },
      get permissionReady() { return currentRuntimeRef.current.permissionReady; },
      getSnapshot: () => currentRuntimeRef.current.getSnapshot(),
      prepare: (context) => currentRuntimeRef.current.prepare(context),
      primePermission: () => currentRuntimeRef.current.primePermission?.()
        ?? currentRuntimeRef.current.requestPermission(),
      requestPermission: () => currentRuntimeRef.current.requestPermission(),
      start: (context) => currentRuntimeRef.current.start(context),
      stop: (context) => currentRuntimeRef.current.stop(context),
      subscribe: (listener) => currentRuntimeRef.current.subscribe(listener),
    };
  }
  const stableRuntime = stableRuntimeRef.current;

  useEffect(() => {
    const detach = engine.attachRuntime(stableRuntime, runtimeEpoch);
    return () => {
      detach();
      // Let the Engine finish the active operation before the native recorder is released.
      void engine.interrupt().finally(() => stableRuntime.dispose());
    };
  }, [engine, runtimeEpoch, stableRuntime]);

  return children;
}

export function SpeakingRecordingControllerHost({
  cardId,
  children,
  onClear,
  onInteractionChange,
  onRecorded,
  recording,
  sessionId,
}: SpeakingRecordingControllerHostProps) {
  const engineRef = useRef<RecordingEngine | undefined>(undefined);
  if (!engineRef.current) {
    engineRef.current = new RecordingEngine({
      audioSession: audioSessionOrchestrator,
      config: { cardId, onClear, onRecorded, recording, sessionId },
      repository: recordingRepository,
    });
  }
  const engine = engineRef.current;
  const controller = useSpeakingRecordingController(engine);

  useEffect(() => {
    engine.configure({ cardId, onClear, onRecorded, recording, sessionId });
  }, [cardId, engine, onClear, onRecorded, recording, sessionId]);

  useEffect(() => {
    onInteractionChange?.(controller.interactionActive);
  }, [controller.interactionActive, onInteractionChange]);

  useEffect(() => audioSessionOrchestrator.register('recording', {
    deactivate: () => engine.interrupt(),
  }), [engine]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void engine.interrupt();
    });
    return () => subscription.remove();
  }, [engine]);

  useEffect(() => () => {
    onInteractionChange?.(false);
    engine.destroy();
  }, [engine, onInteractionChange]);

  return createElement(
    RecordingRuntimeHost,
    { engine, key: controller.runtimeEpoch, runtimeEpoch: controller.runtimeEpoch },
    children(controller),
  );
}

export { useSpeakingRecordingController };
