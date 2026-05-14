import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parse, serialize } from '@minddoc/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

describe('Round-trip fidelity', () => {
  test('simple.mind.md 往返一致', () => {
    const text = readFileSync(join(fixturesDir, 'simple.mind.md'), 'utf-8');
    const tree = parse(text);
    expect(serialize(tree)).toBe(text);
  });

  test('complex.mind.md 往返一致', () => {
    const text = readFileSync(join(fixturesDir, 'complex.mind.md'), 'utf-8');
    const tree = parse(text);
    expect(serialize(tree)).toBe(text);
  });

  test('heading-jump.mind.md 往返一致', () => {
    const text = readFileSync(join(fixturesDir, 'heading-jump.mind.md'), 'utf-8');
    const tree = parse(text);
    expect(serialize(tree)).toBe(text);
  });

  test('list-only.mind.md 往返一致', () => {
    const text = readFileSync(join(fixturesDir, 'list-only.mind.md'), 'utf-8');
    const tree = parse(text);
    expect(serialize(tree)).toBe(text);
  });

  test('no-frontmatter.mind.md 往返一致', () => {
    const text = readFileSync(join(fixturesDir, 'no-frontmatter.mind.md'), 'utf-8');
    const tree = parse(text);
    expect(serialize(tree)).toBe(text);
  });

  test('empty.mind.md 往返一致', () => {
    const text = readFileSync(join(fixturesDir, 'empty.mind.md'), 'utf-8');
    const tree = parse(text);
    expect(serialize(tree)).toBe(text);
  });

  test('所有 fixtures 文件往返一致', () => {
    const files = readdirSync(fixturesDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const text = readFileSync(join(fixturesDir, file), 'utf-8');
      const tree = parse(text);
      expect(serialize(tree), `Round-trip failed for ${file}`).toBe(text);
    }
  });
});
