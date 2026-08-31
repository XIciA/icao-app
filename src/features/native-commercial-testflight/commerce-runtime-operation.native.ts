const DEFAULT_RUNTIME_OPERATION_DEADLINE_MS = 60_000;

export class CommerceRuntimeOperationDeadlineError extends Error {
  constructor() {
    super('commerce_runtime_operation_timed_out');
    this.name = 'CommerceRuntimeOperationDeadlineError';
  }
}
type RuntimeOperationOptions = Readonly<{
  deadlineMs?: number;
  onRelease?: () => void;
}>;

/**
 * One public commerce operation and every asynchronous dependency it started.
 *
 * A deadline rejects the public wait promptly, but it deliberately does not
 * pretend that JS cancelled SecureStore, AsyncStorage, networking, or StoreKit.
 * The scope remains occupied until every tracked promise has physically
 * settled, preventing a second operation from racing late native side effects.
 */
export class CommerceRuntimeOperationScope {
  private closed = false;
  private readonly controller = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  private released = false;
  private timedOut = false;
  private readonly timeout: ReturnType<typeof setTimeout>;

  constructor(private readonly options: RuntimeOperationOptions = {}) {
    this.timeout = setTimeout(() => {
      this.timedOut = true;
      this.controller.abort();
    }, options.deadlineMs ?? DEFAULT_RUNTIME_OPERATION_DEADLINE_MS);
  }

  get signal() {
    return this.controller.signal;
  }

  get deadlineElapsed() {
    return this.timedOut;
  }

  /** Await within the shared operation deadline while retaining the raw drain. */
  wait<T>(promise: Promise<T>): Promise<T> {
    const raw = Promise.resolve(promise);
    this.track(raw);
    if (this.controller.signal.aborted) return Promise.reject(this.abortError());
    return new Promise<T>((resolve, reject) => {
      let publicSettled = false;
      const finish = (callback: () => void) => {
        if (publicSettled) return;
        publicSettled = true;
        this.controller.signal.removeEventListener('abort', onAbort);
        callback();
      };
      const onAbort = () => finish(() => reject(this.abortError()));
      this.controller.signal.addEventListener('abort', onAbort, { once: true });
      void raw.then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
    });
  }

  /** Retain a non-awaited native/storage cleanup in the physical drain set. */
  drain(promise: Promise<unknown>) {
    this.track(Promise.resolve(promise));
  }

  /** End the public operation; the single-flight lock releases only when drained. */
  finish() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timeout);
    this.releaseIfDrained();
  }

  /** Account teardown aborts public waits but still observes all raw drains. */
  abort() {
    this.controller.abort();
    this.finish();
  }

  private abortError() {
    return this.timedOut
      ? new CommerceRuntimeOperationDeadlineError()
      : new Error('commerce_operation_cancelled');
  }

  private track(promise: Promise<unknown>) {
    this.pending.add(promise);
    void promise.then(
      () => this.settled(promise),
      () => this.settled(promise),
    );
  }

  private settled(promise: Promise<unknown>) {
    this.pending.delete(promise);
    this.releaseIfDrained();
  }

  private releaseIfDrained() {
    if (!this.closed || this.pending.size > 0 || this.released) return;
    this.released = true;
    this.options.onRelease?.();
  }
}

export class CommerceRuntimeOperationGate {
  private active?: CommerceRuntimeOperationScope;

  get busy() {
    return Boolean(this.active);
  }

  begin(options: Omit<RuntimeOperationOptions, 'onRelease'> = {}) {
    if (this.active) return undefined;
    const operation = new CommerceRuntimeOperationScope({
      ...options,
      onRelease: () => {
        if (this.active === operation) this.active = undefined;
      },
    });
    this.active = operation;
    return operation;
  }

  /** Detach an old account's isolated provider while aborting its public work. */
  abortAndDetach() {
    const operation = this.active;
    this.active = undefined;
    operation?.abort();
  }
}
