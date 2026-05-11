export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number,
  options?: { maxWait?: number }
): T & { cancel: () => void } {
  let timer: number | null = null;
  let firstCallTime: number | null = null;

  const debounced = (...args: any[]) => {
    const now = Date.now();
    if (timer) clearTimeout(timer);

    if (firstCallTime === null) {
      firstCallTime = now;
    }

    if (options?.maxWait && now - firstCallTime >= options.maxWait) {
      fn(...args);
      firstCallTime = null;
      return;
    }

    timer = window.setTimeout(() => {
      fn(...args);
      timer = null;
      firstCallTime = null;
    }, delay);
  };

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    firstCallTime = null;
  };

  return debounced as any;
}
