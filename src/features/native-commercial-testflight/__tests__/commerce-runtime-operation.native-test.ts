import {
  CommerceRuntimeOperationDeadlineError,
  CommerceRuntimeOperationGate,
} from '../commerce-runtime-operation.native';

describe('CommerceRuntimeOperationGate', () => {
  afterEach(() => jest.useRealTimers());

  it('bounds a never-settling storage wait but keeps the operation locked', async () => {
    jest.useFakeTimers();
    const gate = new CommerceRuntimeOperationGate();
    const operation = gate.begin({ deadlineMs: 100 });
    expect(operation).toBeDefined();

    const publicWait = operation!.wait(new Promise<void>(() => undefined)).catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(100);

    await expect(publicWait).resolves.toBeInstanceOf(CommerceRuntimeOperationDeadlineError);
    operation!.finish();
    expect(gate.busy).toBe(true);
    expect(gate.begin()).toBeUndefined();
  });

  it('releases only after a timed-out native promise physically drains', async () => {
    jest.useFakeTimers();
    let settle!: () => void;
    const nativeWork = new Promise<void>((resolve) => { settle = resolve; });
    const gate = new CommerceRuntimeOperationGate();
    const operation = gate.begin({ deadlineMs: 100 })!;
    const publicWait = operation.wait(nativeWork).catch((error: unknown) => error);

    await jest.advanceTimersByTimeAsync(100);
    await expect(publicWait).resolves.toBeInstanceOf(CommerceRuntimeOperationDeadlineError);
    operation.finish();
    expect(gate.busy).toBe(true);

    settle();
    await nativeWork;
    await Promise.resolve();
    expect(gate.busy).toBe(false);
    gate.begin()!.finish();
  });

  it('uses one total deadline across sequential waits', async () => {
    jest.useFakeTimers();
    const gate = new CommerceRuntimeOperationGate();
    const operation = gate.begin({ deadlineMs: 100 })!;

    await jest.advanceTimersByTimeAsync(60);
    await expect(operation.wait(Promise.resolve('first'))).resolves.toBe('first');
    const second = operation.wait(new Promise<void>(() => undefined)).catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(40);

    await expect(second).resolves.toBeInstanceOf(CommerceRuntimeOperationDeadlineError);
    operation.finish();
    expect(gate.busy).toBe(true);
  });
});
