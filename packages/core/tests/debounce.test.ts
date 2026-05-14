import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { debounce } from '@mindctx/core';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.stubGlobal('window', globalThis);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('delays single execution', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(99);
    expect(fn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('multiple rapid calls only execute once', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    await vi.advanceTimersByTimeAsync(50);
    debounced();
    await vi.advanceTimersByTimeAsync(50);
    debounced();

    await vi.advanceTimersByTimeAsync(99);
    expect(fn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('maxWait triggers execution even during rapid calls', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100, { maxWait: 250 });

    debounced();
    await vi.advanceTimersByTimeAsync(90);
    debounced();
    await vi.advanceTimersByTimeAsync(90);
    debounced();
    await vi.advanceTimersByTimeAsync(70);
    debounced();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('cancel prevents execution', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced.cancel();

    await vi.advanceTimersByTimeAsync(100);
    expect(fn).not.toHaveBeenCalled();
  });

  test('function receives correct arguments', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('mindctx', 42);
    await vi.advanceTimersByTimeAsync(100);

    expect(fn).toHaveBeenCalledWith('mindctx', 42);
  });
});
