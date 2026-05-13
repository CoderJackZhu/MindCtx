import { describe, test, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { serialize, serializeSubtree } from '../src/core/serializer.js';

describe('Serializer', () => {
  test('基本标题序列化', () => {
    const md = '# Title\n\n## Sub\n\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('列表序列化', () => {
    const md = '# Title\n\n- Item 1\n- Item 2\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('混合结构序列化', () => {
    const md = '# Title\n\n## Sub\n\n- Item\n  - Nested\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('note 正确输出', () => {
    const md = '# Title\n\nSome note text.\n\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('blocks 正确输出', () => {
    const md = '# Title\n\n```js\ncode\n```\n\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('任务列表正确输出', () => {
    const md = '# Title\n\n- [ ] Todo\n- [x] Done\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('frontmatter 正确输出', () => {
    const md = '---\nminddoc: true\n---\n\n# Title\n\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('dirty 节点重新序列化', () => {
    const md = '# Old Title\n\n';
    const tree = parse(md);
    tree.root.children[0].title = 'New Title';
    tree.root.children[0].dirty = true;
    tree.root.subtreeDirty = true;
    const result = serialize(tree);
    expect(result).toContain('# New Title');
    expect(result).not.toContain('# Old Title');
  });

  test('非 dirty 节点使用 rawText', () => {
    const md = '# Title\n\n## Sub\n\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('serializeSubtree 基本功能', () => {
    const md = '# Root\n\n## Child\n\n- Item\n';
    const tree = parse(md);
    const h1 = tree.root.children[0]; // "Root" H1
    const result = serializeSubtree(h1, 3, 1);
    expect(result).toContain('# Root');
  });

  test('heading-depth 控制类型转换', () => {
    // With headingDepth=1, depth 2 nodes should become list-items
    const md = '# Root\n\n## Sub\n\n';
    const tree = parse(md);
    // Mark the H2 node as dirty so it regenerates
    tree.root.children[0].children[0].dirty = true;
    tree.root.children[0].subtreeDirty = true;
    tree.root.subtreeDirty = true;
    // Serialize with headingDepth=1 (so depth 2 = list-item)
    const result = serialize(tree, { headingDepth: 1 });
    expect(result).toContain('- Sub');
  });

  test('dirty 列表项 block 不会被重复缩进', () => {
    const md = '# Title\n\n- Item\n  > quoted\n';
    const tree = parse(md);
    const item = tree.root.children[0].children[0];
    item.title = 'Changed';
    item.dirty = true;
    tree.root.subtreeDirty = true;
    tree.root.children[0].subtreeDirty = true;

    expect(serialize(tree)).toBe('# Title\n\n- Changed\n  > quoted\n\n');
  });
});
