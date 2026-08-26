import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';

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
  | 'mode_switch_timeout'
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

export class AudioSessionOrchestrator {
  private readonly clients = new Map<AudioOwner, AudioSessionClient>();
  private active?: AudioLease;
  private nextToken = 1;
  private transition: Promise<void> = Promise.resolve();
  private blockedTransition?: { error: AudioSessionError; token: number };
  private nextBlockedToken = 1;

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
          await this.boundedOwnerDeactivation(
            Promise.resolve(client.deactivate(reason)),
            previous,
          );
        } catch (error) {
          const code = error instanceof AudioSessionError ? error.code : 'owner_pause_failed';
          emitAudioDiagnostic({ code, level: 'error', owner: previous.owner, reason, scope: 'session' });
          throw error;
        }
      }
      try {
        await this.boundedTransition(
          setAudioModeAsync(profiles[owner]),
          'mode_switch_timeout',
          'mode_switch_failed',
          true,
        );
        await this.boundedTransition(
          setIsAudioActiveAsync(true),
          'mode_switch_timeout',
          'mode_switch_failed',
          true,
        );
      } catch (error) {
        const code = error instanceof AudioSessionError ? error.code : 'mode_switch_failed';
        emitAudioDiagnostic({ code, level: 'error', owner, scope: 'session' });
        throw error instanceof AudioSessionError
          ? error
          : new AudioSessionError('mode_switch_failed', 'Unable to activate the requested audio profile.');
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
        await this.boundedTransition(
          setAudioModeAsync(profiles.idle),
          'mode_switch_timeout',
          'mode_switch_failed',
          true,
        );
        await this.boundedTransition(
          setIsAudioActiveAsync(false),
          'mode_switch_timeout',
          'mode_switch_failed',
          true,
        );
      } catch (error) {
        this.active = undefined;
        const code = error instanceof AudioSessionError ? error.code : 'mode_switch_failed';
        emitAudioDiagnostic({ code, level: 'error', owner: lease.owner, scope: 'session' });
        throw error instanceof AudioSessionError
          ? error
          : new AudioSessionError('mode_switch_failed', 'Unable to restore the idle audio profile.');
      }
      this.active = undefined;
      emitAudioDiagnostic({ code: 'owner_released', level: 'info', owner: lease.owner, scope: 'session' });
    });
  }

  getActiveLeaseForTests() {
    return this.active;
  }

  getActiveOwner() {
    return this.active?.owner;
  }

  resetForTests() {
    this.clients.clear();
    this.active = undefined;
    this.nextToken = 1;
    this.transition = Promise.resolve();
    this.blockedTransition = undefined;
    this.nextBlockedToken = 1;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.transition.catch(() => undefined).then(() => {
      if (this.blockedTransition) {
        throw new AudioSessionError(
          this.blockedTransition.error.code,
          'The previous audio transition is still recovering.',
        );
      }
      return operation();
    });
    this.transition = result.then(() => undefined, () => undefined);
    return result;
  }

  private boundedTransition<T>(
    operation: Promise<T>,
    timeoutCode: AudioSessionErrorCode,
    failureCode: AudioSessionErrorCode,
    recoverSession = false,
  ) {
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const settlement = operation.then(() => undefined, () => undefined);
      const timeout = setTimeout(() => {
        if (finished) return;
        finished = true;
        const error = new AudioSessionError(timeoutCode, timeoutCode);
        this.blockUntilSettled(error, settlement, recoverSession);
        reject(error);
      }, TRANSITION_TIMEOUT_MS);
      operation.then(
        (value) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          resolve(value);
        },
        () => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          const error = new AudioSessionError(failureCode, failureCode);
          if (recoverSession) this.blockUntilSettled(error, Promise.resolve(), true);
          reject(error);
        },
      );
    });
  }

  private boundedOwnerDeactivation(operation: Promise<void>, previous: AudioLease) {
    return new Promise<void>((resolve, reject) => {
      let finished = false;
      const timeout = setTimeout(() => {
        if (finished) return;
        finished = true;
        const error = new AudioSessionError('owner_pause_timeout', 'owner_pause_timeout');
        this.blockUntilOwnerPauseSettled(error, operation, previous);
        reject(error);
      }, TRANSITION_TIMEOUT_MS);
      operation.then(
        () => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          resolve();
        },
        () => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          reject(new AudioSessionError('owner_pause_failed', 'owner_pause_failed'));
        },
      );
    });
  }

  private blockUntilSettled(
    error: AudioSessionError,
    settlement: Promise<void>,
    recoverSession: boolean,
  ) {
    const token = this.nextBlockedToken++;
    const block = { error, token };
    this.blockedTransition = block;
    // A timed-out native operation cannot be cancelled. Session-changing operations
    // must settle first, then reconcile to idle/inactive before a new owner can enter.
    const recovery = settlement.then(() => (
      recoverSession ? this.reconcileIdleSession() : undefined
    ));
    void recovery.then(
      () => {
        if (this.blockedTransition === block) this.blockedTransition = undefined;
      },
      () => {
        // If reconciliation cannot be proven, remain fail-closed until App restart.
      },
    );
  }

  private blockUntilOwnerPauseSettled(
    error: AudioSessionError,
    settlement: Promise<void>,
    previous: AudioLease,
  ) {
    const token = this.nextBlockedToken++;
    const block = { error, token };
    this.blockedTransition = block;
    // A late successful pause means the old client is no longer an audio owner.
    // Remove only that exact lease, then prove the native session is idle before
    // another owner can acquire it. A late rejection remains fail-closed.
    void settlement.then(
      async () => {
        if (this.blockedTransition !== block) return;
        if (this.active?.token === previous.token && this.active.owner === previous.owner) {
          this.active = undefined;
        }
        await this.reconcileIdleSession();
        if (this.blockedTransition === block) this.blockedTransition = undefined;
      },
      () => {
        // The old client never confirmed it paused, so ownership remains blocked.
      },
    );
  }

  private async reconcileIdleSession() {
    await setAudioModeAsync(profiles.idle);
    await setIsAudioActiveAsync(false);
  }
}

export const audioSessionOrchestrator = new AudioSessionOrchestrator();
