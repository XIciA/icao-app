import { setAudioModeAsync } from 'expo-audio';

import { emitAudioDiagnostic } from './audio-diagnostics';

export type AudioOwner = 'radio' | 'study' | 'recording' | 'recordingPlayback';

export type AudioLease = Readonly<{
  owner: AudioOwner;
  token: number;
}>;

export type AudioSessionClient = {
  deactivate: (reason: string) => Promise<void> | void;
};

export type AudioSessionErrorCode =
  | 'mode_switch_failed'
  | 'owner_pause_failed'
  | 'owner_pause_timeout'
  | 'recording_exclusive';

export class AudioSessionError extends Error {
  constructor(readonly code: AudioSessionErrorCode, message: string) {
    super(message);
    this.name = 'AudioSessionError';
  }
}

const TRANSITION_TIMEOUT_MS = 2_000;

const profiles = {
  idle: { allowsRecording: false, interruptionMode: 'doNotMix' as const, playsInSilentMode: true, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false },
  radio: { allowsRecording: false, interruptionMode: 'doNotMix' as const, playsInSilentMode: true, shouldPlayInBackground: true, shouldRouteThroughEarpiece: false },
  study: { allowsRecording: false, interruptionMode: 'doNotMix' as const, playsInSilentMode: true, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false },
  recording: { allowsRecording: true, interruptionMode: 'doNotMix' as const, playsInSilentMode: true, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false },
  recordingPlayback: { allowsRecording: false, interruptionMode: 'doNotMix' as const, playsInSilentMode: true, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false },
};

function bounded<T>(operation: Promise<T>, timeoutCode: AudioSessionErrorCode, failureCode: AudioSessionErrorCode) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new AudioSessionError(timeoutCode, timeoutCode)), TRANSITION_TIMEOUT_MS);
    operation.then(resolve, () => reject(new AudioSessionError(failureCode, failureCode))).finally(() => clearTimeout(timeout));
  });
}

export class AudioSessionOrchestrator {
  private readonly clients = new Map<AudioOwner, AudioSessionClient>();
  private active?: AudioLease;
  private nextToken = 1;
  private transition: Promise<void> = Promise.resolve();

  register(owner: AudioOwner, client: AudioSessionClient) {
    this.clients.set(owner, client);
    return () => {
      if (this.clients.get(owner) === client) this.clients.delete(owner);
    };
  }

  acquire(owner: AudioOwner, reason: string): Promise<AudioLease> {
    return this.enqueue(async () => {
      const previous = this.active;
      if (previous?.owner === 'recording' && owner !== 'recording') {
        emitAudioDiagnostic({ code: 'recording_exclusive', level: 'warning', owner, scope: 'session' });
        throw new AudioSessionError('recording_exclusive', 'Recording owns the audio session.');
      }
      if (previous && previous.owner !== owner) {
        const client = this.clients.get(previous.owner);
        if (!client) {
          emitAudioDiagnostic({ code: 'owner_pause_failed', level: 'error', owner: previous.owner, reason, scope: 'session' });
          throw new AudioSessionError('owner_pause_failed', 'The active audio owner is not registered.');
        }
        try {
          await bounded(Promise.resolve(client.deactivate(reason)), 'owner_pause_timeout', 'owner_pause_failed');
        } catch (error) {
          const code = error instanceof AudioSessionError ? error.code : 'owner_pause_failed';
          emitAudioDiagnostic({ code, level: 'error', owner: previous.owner, reason, scope: 'session' });
          throw error;
        }
      }
      try {
        await bounded(setAudioModeAsync(profiles[owner]), 'mode_switch_failed', 'mode_switch_failed');
      } catch {
        emitAudioDiagnostic({ code: 'mode_switch_failed', level: 'error', owner, scope: 'session' });
        throw new AudioSessionError('mode_switch_failed', 'Unable to activate the requested audio profile.');
      }
      const lease = Object.freeze({ owner, token: this.nextToken++ });
      this.active = lease;
      emitAudioDiagnostic({ code: 'owner_acquired', level: 'info', owner, reason, scope: 'session' });
      return lease;
    });
  }

  release(lease: AudioLease): Promise<void> {
    return this.enqueue(async () => {
      if (this.active?.token !== lease.token || this.active.owner !== lease.owner) return;
      try {
        await bounded(setAudioModeAsync(profiles.idle), 'mode_switch_failed', 'mode_switch_failed');
      } catch {
        this.active = undefined;
        emitAudioDiagnostic({ code: 'mode_switch_failed', level: 'error', owner: lease.owner, scope: 'session' });
        throw new AudioSessionError('mode_switch_failed', 'Unable to restore the idle audio profile.');
      }
      this.active = undefined;
      emitAudioDiagnostic({ code: 'owner_released', level: 'info', owner: lease.owner, scope: 'session' });
    });
  }

  getActiveLeaseForTests() {
    return this.active;
  }

  resetForTests() {
    this.clients.clear();
    this.active = undefined;
    this.nextToken = 1;
    this.transition = Promise.resolve();
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.transition.catch(() => undefined).then(operation);
    this.transition = result.then(() => undefined, () => undefined);
    return result;
  }
}

export const audioSessionOrchestrator = new AudioSessionOrchestrator();
