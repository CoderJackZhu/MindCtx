import { describe, test, expect } from 'vitest';
import { fnv1a64, generateNodeId } from '../src/core/hash.js';

describe('hash', () => {
  test('fnv1a64 returns consistent results', () => {
    const h1 = fnv1a64('hello');
    const h2 = fnv1a64('hello');
    expect(h1).toBe(h2);
  });

  test('fnv1a64 different inputs produce different outputs', () => {
    const h1 = fnv1a64('hello');
    const h2 = fnv1a64('world');
    expect(h1).not.toBe(h2);
  });

  test('fnv1a64 returns base36 string', () => {
    const h = fnv1a64('test');
    expect(h).toMatch(/^[0-9a-z]+$/);
  });

  test('generateNodeId uses path and index', () => {
    const id1 = generateNodeId(['root', 'child'], 0);
    const id2 = generateNodeId(['root', 'child'], 1);
    expect(id1).not.toBe(id2);
  });

  test('generateNodeId different paths produce different IDs', () => {
    const id1 = generateNodeId(['root', 'child1'], 0);
    const id2 = generateNodeId(['root', 'child2'], 0);
    expect(id1).not.toBe(id2);
  });
});
