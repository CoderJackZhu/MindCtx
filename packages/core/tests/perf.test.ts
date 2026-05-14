import { test, expect } from 'vitest';
import { parse } from '@minddoc/core';

test('5000+ line Markdown parsing < 2000ms', () => {
  let bigMd = '---\nminddoc: true\n---\n\n';
  for (let i = 0; i < 400; i++) {
    bigMd += '# Heading ' + i + '\n\n';
    bigMd += 'Some description for heading ' + i + '.\n\n';
    for (let j = 0; j < 5; j++) {
      bigMd += '- Item ' + i + '.' + j + '\n';
      bigMd += '  - Sub item ' + i + '.' + j + '.1\n';
      bigMd += '  - Sub item ' + i + '.' + j + '.2\n';
    }
    bigMd += '\n';
  }

  const lines = bigMd.split('\n').length;
  expect(lines).toBeGreaterThan(5000);

  const start = performance.now();
  const tree = parse(bigMd);
  const elapsed = performance.now() - start;

  console.log(`Lines: ${lines}, Parse time: ${elapsed.toFixed(1)}ms, Nodes: ${tree.metadata.nodeCount}`);
  expect(elapsed).toBeLessThan(2000);
});
