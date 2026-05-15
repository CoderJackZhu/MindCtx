import { describe, test, expect, beforeEach } from 'vitest';
import { parse, applyOperation, findNode, findParent, findIndex, recalculateNodeTypes, getAbsoluteDepth, serialize, UndoManager } from '@mindctx/core';
import type { MindCtxTree } from '@mindctx/core';

const simpleMd = `---
mindctx: true
heading-depth: 3
---

# Root

## Child A

- Item 1
- Item 2
- Item 3

## Child B

- Item B1
`;

function makeTree(): MindCtxTree {
  return parse(simpleMd);
}

describe('Operations', () => {
  let tree: MindCtxTree;

  beforeEach(() => { tree = makeTree(); });

  test('move 节点到新父节点', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const childB = h1.children[1];
    const item1 = childA.children[0];
    const item1Id = item1.id;

    expect(childA.children.length).toBe(3);
    expect(childB.children.length).toBe(1);

    const op = applyOperation(tree, { type: 'move', nodeId: item1Id, newParentId: childB.id, index: -1 });

    expect(op.type).toBe('move');
    expect(childA.children.length).toBe(2);
    expect(childB.children.length).toBe(2);
    expect(childB.children[1].id).toBe(item1Id);
    expect(childB.children[1].title).toBe('Item 1');
  });

  test('move 节点改变顺序', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item3 = childA.children[2];
    const item3Id = item3.id;

    const op = applyOperation(tree, { type: 'move', nodeId: item3Id, newParentId: childA.id, index: 0 });

    expect(op.type).toBe('move');
    expect(childA.children[0].title).toBe('Item 3');
    expect(childA.children[1].title).toBe('Item 1');
    expect(childA.children[2].title).toBe('Item 2');
  });

  test('move 同一父节点时正确处理向后插入索引', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item1 = childA.children[0];
    const item2 = childA.children[1];

    applyOperation(tree, { type: 'move', nodeId: item1.id, newParentId: childA.id, index: findIndex(childA, item2.id) + 1 });

    expect(childA.children.map(c => c.title)).toEqual(['Item 2', 'Item 1', 'Item 3']);
    expect(serialize(tree)).toContain('- Item 2\n- Item 1\n- Item 3');
  });

  test('move 拒绝把节点移动到自身后代下', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];

    expect(() => applyOperation(tree, { type: 'move', nodeId: childA.id, newParentId: childA.children[0].id, index: -1 }))
      .toThrow('Cannot move');
  });

  test('rename 节点', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const childAId = childA.id;

    const op = applyOperation(tree, { type: 'rename', nodeId: childAId, newTitle: 'Renamed' });

    expect(op.type).toBe('rename');
    if (op.type === 'rename') {
      expect(op.oldTitle).toBe('Child A');
    }
    expect(childA.title).toBe('Renamed');
  });

  test('create 新节点', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const childAId = childA.id;

    const op = applyOperation(tree, { type: 'create', parentId: childAId, index: 0, title: 'New Item' });

    expect(op.type).toBe('create');
    expect(childA.children.length).toBe(4);
    expect(childA.children[0].title).toBe('New Item');
    expect(childA.children[0].dirty).toBe(true);
  });

  test('delete 节点', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item1Id = childA.children[0].id;

    expect(childA.children.length).toBe(3);

    const op = applyOperation(tree, { type: 'delete', nodeId: item1Id });

    expect(op.type).toBe('delete');
    expect(childA.children.length).toBe(2);
    if (op.type === 'delete') {
      expect(op.deletedNode.title).toBe('Item 1');
    }
  });

  test('delete 后序列化不会保留已删除节点', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];

    applyOperation(tree, { type: 'delete', nodeId: childA.children[0].id });

    const markdown = serialize(tree);
    expect(markdown).not.toContain('- Item 1');
    expect(markdown).toContain('- Item 2');
  });

  test('indent 节点', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item1 = childA.children[0];
    const item2Id = childA.children[1].id;

    const op = applyOperation(tree, { type: 'indent', nodeId: item2Id });

    expect(op.type).toBe('indent');
    // Item 2 should now be a child of Item 1
    expect(childA.children.length).toBe(2); // Item 1, Item 3
    expect(item1.children.length).toBe(1);
    expect(item1.children[0].title).toBe('Item 2');
  });

  test('outdent 节点', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item2Id = childA.children[1].id;

    // First indent Item 2 under Item 1
    applyOperation(tree, { type: 'indent', nodeId: item2Id });
    const item1 = childA.children[0];
    expect(item1.children[0].title).toBe('Item 2');

    // Now outdent Item 2 back
    applyOperation(tree, { type: 'outdent', nodeId: item2Id });

    // Item 2 should be back in Child A's children (after Item 1)
    expect(item1.children.length).toBe(0);
    // After outdent, Item 2 is inserted after its parent (Item 1) in grandparent's (Child A) children
    // So the order should be: Item 1, Item 2, Item 3
    const titles = childA.children.map(c => c.title);
    expect(titles).toContain('Item 2');
  });

  test('indent 边界：第一个兄弟不能 indent', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item1Id = childA.children[0].id;

    applyOperation(tree, { type: 'indent', nodeId: item1Id });
    expect(childA.children.map(c => c.title)).toEqual(['Item 1', 'Item 2', 'Item 3']);
  });

  test('outdent 边界：根的子节点不能 outdent', () => {
    const h1 = tree.root.children[0];
    const h1Id = h1.id;

    applyOperation(tree, { type: 'outdent', nodeId: h1Id });
    expect(tree.root.children.map(c => c.title)).toEqual(['Root']);
  });

  test('moveUp/moveDown', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item2Id = childA.children[1].id;

    // moveUp Item 2 (should swap with Item 1)
    applyOperation(tree, { type: 'moveUp', nodeId: item2Id });
    expect(childA.children[0].title).toBe('Item 2');
    expect(childA.children[1].title).toBe('Item 1');

    // moveDown Item 2 back (now at index 0, swap with index 1)
    applyOperation(tree, { type: 'moveDown', nodeId: item2Id });
    expect(childA.children[0].title).toBe('Item 1');
    expect(childA.children[1].title).toBe('Item 2');
  });

  test('moveUp 后序列化使用新顺序', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item2Id = childA.children[1].id;

    applyOperation(tree, { type: 'moveUp', nodeId: item2Id });

    expect(serialize(tree)).toContain('- Item 2\n- Item 1\n- Item 3');
  });

  test('toggleCheck 循环', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item1 = childA.children[0];
    const item1Id = item1.id;

    // null -> false
    expect(item1.checked).toBe(null);
    applyOperation(tree, { type: 'toggleCheck', nodeId: item1Id });
    expect(item1.checked).toBe(false);

    // false -> true
    applyOperation(tree, { type: 'toggleCheck', nodeId: item1Id });
    expect(item1.checked).toBe(true);

    // true -> null
    applyOperation(tree, { type: 'toggleCheck', nodeId: item1Id });
    expect(item1.checked).toBe(null);
  });

  test('toggleCheck 标题节点会序列化为任务列表项', () => {
    const h1 = tree.root.children[0];

    applyOperation(tree, { type: 'toggleCheck', nodeId: h1.id });

    expect(serialize(tree).startsWith('---\nmindctx: true\nheading-depth: 3\n---\n\n- [ ] Root\n')).toBe(true);
  });

  test('操作后节点 dirty=true', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const childAId = childA.id;

    expect(childA.dirty).toBe(false);
    applyOperation(tree, { type: 'rename', nodeId: childAId, newTitle: 'Changed' });
    expect(childA.dirty).toBe(true);
  });

  test('操作后 recalculateNodeTypes 正确', () => {
    // Move a list-item to become a direct child of root (depth 1, within headingDepth=3)
    // It should become a heading node
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item1 = childA.children[0];
    const item1Id = item1.id;

    expect(item1.nodeType).toBe('list-item');

    // Move item1 to be child of root (depth = 1, headingDepth = 3, so 1 <= 3 → heading)
    applyOperation(tree, { type: 'move', nodeId: item1Id, newParentId: tree.root.id, index: -1 });

    const movedNode = findNode(tree.root, item1Id)!;
    expect(movedNode.nodeType).toBe('heading');
    expect(movedNode.headingLevel).toBe(1);
  });

  test('indent on first child does nothing (no previous sibling)', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item1Id = childA.children[0].id;
    const before = serialize(tree);

    const op = applyOperation(tree, { type: 'indent', nodeId: item1Id });

    expect(op.type).toBe('indent');
    expect(serialize(tree)).toBe(before);
    expect(findParent(tree.root, item1Id)?.id).toBe(childA.id);
    expect(findIndex(childA, item1Id)).toBe(0);
  });

  test('outdent on root child does nothing', () => {
    const h1 = tree.root.children[0];
    const before = serialize(tree);

    const op = applyOperation(tree, { type: 'outdent', nodeId: h1.id });

    expect(op.type).toBe('outdent');
    expect(serialize(tree)).toBe(before);
    expect(findParent(tree.root, h1.id)?.id).toBe(tree.root.id);
  });

  test('moveUp on first sibling is no-op', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item1Id = childA.children[0].id;
    const before = childA.children.map(c => c.id);

    const op = applyOperation(tree, { type: 'moveUp', nodeId: item1Id });

    expect(op.type).toBe('moveUp');
    expect(childA.children.map(c => c.id)).toEqual(before);
  });

  test('moveDown on last sibling is no-op', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item3Id = childA.children[2].id;
    const before = childA.children.map(c => c.id);

    const op = applyOperation(tree, { type: 'moveDown', nodeId: item3Id });

    expect(op.type).toBe('moveDown');
    expect(childA.children.map(c => c.id)).toEqual(before);
  });

  test('create with non-existent parentId throws', () => {
    expect(() => applyOperation(tree, { type: 'create', parentId: 'missing-parent', index: -1, title: 'Orphan' }))
      .toThrow('Cannot find parent: missing-parent');
  });

  test('delete root node is blocked', () => {
    expect(() => applyOperation(tree, { type: 'delete', nodeId: tree.root.id }))
      .toThrow(`Cannot find parent for node: ${tree.root.id}`);
  });

  test('recalculateNodeTypes: list item becomes heading after outdent', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item2Id = childA.children[1].id;

    applyOperation(tree, { type: 'indent', nodeId: item2Id });
    const indentedItem2 = findNode(tree.root, item2Id)!;
    expect(indentedItem2.nodeType).toBe('list-item');

    applyOperation(tree, { type: 'outdent', nodeId: item2Id });
    const outdentedItem2 = findNode(tree.root, item2Id)!;
    const depth = getAbsoluteDepth(tree.root, item2Id);
    recalculateNodeTypes(outdentedItem2, depth, tree.headingDepth);

    expect(outdentedItem2.nodeType).toBe('heading');
    expect(outdentedItem2.headingLevel).toBe(3);
  });

  test('indent then outdent restores original state', () => {
    const shallowMd = `---\nmindctx: true\nheading-depth: 2\n---\n\n# Root\n\n## Child A\n\n- Item 1\n- Item 2\n- Item 3\n\n## Child B\n\n- Item B1\n`;
    const localTree = parse(shallowMd);
    const h1 = localTree.root.children[0];
    const childA = h1.children[0];
    const item2Id = childA.children[1].id;
    const before = serialize(localTree);

    applyOperation(localTree, { type: 'indent', nodeId: item2Id });
    applyOperation(localTree, { type: 'outdent', nodeId: item2Id });

    expect(serialize(localTree)).toBe(before);
    expect(findParent(localTree.root, item2Id)?.id).toBe(childA.id);
    expect(findIndex(childA, item2Id)).toBe(1);
  });

  test('move node across different parents updates depth', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const childB = h1.children[1];
    const item1Id = childA.children[0].id;

    expect(getAbsoluteDepth(tree.root, item1Id)).toBe(3);
    applyOperation(tree, { type: 'move', nodeId: item1Id, newParentId: childB.children[0].id, index: -1 });

    const movedItem = findNode(tree.root, item1Id)!;
    expect(findParent(tree.root, item1Id)?.title).toBe('Item B1');
    expect(getAbsoluteDepth(tree.root, item1Id)).toBe(4);
    expect(movedItem.nodeType).toBe('list-item');
    expect(movedItem.listDepth).toBe(1);
  });

  test('toggleCheck cycles null-false-true-null', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item1 = childA.children[0];

    expect(item1.checked).toBe(null);
    applyOperation(tree, { type: 'toggleCheck', nodeId: item1.id });
    expect(item1.checked).toBe(false);
    applyOperation(tree, { type: 'toggleCheck', nodeId: item1.id });
    expect(item1.checked).toBe(true);
    applyOperation(tree, { type: 'toggleCheck', nodeId: item1.id });
    expect(item1.checked).toBe(null);
  });
});

describe('Undo/Redo', () => {
  let tree: MindCtxTree;
  let undoManager: UndoManager;

  beforeEach(() => {
    tree = makeTree();
    undoManager = new UndoManager();
  });

  test('undo rename 操作恢复原标题', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const childAId = childA.id;

    const op = applyOperation(tree, { type: 'rename', nodeId: childAId, newTitle: 'Renamed' });
    undoManager.push([op]);

    expect(childA.title).toBe('Renamed');
    undoManager.undo(tree);
    expect(childA.title).toBe('Child A');
  });

  test('redo 恢复操作后状态', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const childAId = childA.id;

    const op = applyOperation(tree, { type: 'rename', nodeId: childAId, newTitle: 'Renamed' });
    undoManager.push([op]);

    undoManager.undo(tree);
    expect(childA.title).toBe('Child A');

    undoManager.redo(tree);
    expect(childA.title).toBe('Renamed');
  });

  test('undo create 操作删除节点', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const childAId = childA.id;

    const op = applyOperation(tree, { type: 'create', parentId: childAId, index: 0, title: 'New Item' });
    undoManager.push([op]);

    expect(childA.children.length).toBe(4);
    undoManager.undo(tree);
    expect(childA.children.length).toBe(3);
    expect(childA.children[0].title).toBe('Item 1');
  });

  test('undo delete 操作恢复节点', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item1Id = childA.children[0].id;

    const op = applyOperation(tree, { type: 'delete', nodeId: item1Id });
    undoManager.push([op]);

    expect(childA.children.length).toBe(2);
    undoManager.undo(tree);
    expect(childA.children.length).toBe(3);
    expect(childA.children[0].title).toBe('Item 1');
  });

  test('undo move 操作恢复原位置', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const childB = h1.children[1];
    const item1Id = childA.children[0].id;

    const op = applyOperation(tree, { type: 'move', nodeId: item1Id, newParentId: childB.id, index: -1 });
    undoManager.push([op]);

    expect(childA.children.length).toBe(2);
    expect(childB.children.length).toBe(2);

    undoManager.undo(tree);

    expect(childA.children.length).toBe(3);
    expect(childB.children.length).toBe(1);
    expect(childA.children[0].title).toBe('Item 1');
  });

  test('undo toggleCheck 恢复 oldValue（非循环）', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item1 = childA.children[0];
    const item1Id = item1.id;

    // Toggle null -> false
    const op = applyOperation(tree, { type: 'toggleCheck', nodeId: item1Id });
    undoManager.push([op]);

    expect(item1.checked).toBe(false);

    // Undo should restore to null (not cycle to true)
    undoManager.undo(tree);
    expect(item1.checked).toBe(null);
  });

  test('undo/redo toggleCheck 会恢复标题节点类型', () => {
    const h1 = tree.root.children[0];
    const op = applyOperation(tree, { type: 'toggleCheck', nodeId: h1.id });
    undoManager.push([op]);

    expect(h1.nodeType).toBe('list-item');
    expect(h1.checked).toBe(false);

    undoManager.undo(tree);
    expect(h1.nodeType).toBe('heading');
    expect(h1.headingLevel).toBe(1);
    expect(h1.checked).toBe(null);
    expect(serialize(tree)).toContain('# Root');

    undoManager.redo(tree);
    expect(h1.nodeType).toBe('list-item');
    expect(h1.checked).toBe(false);
    expect(serialize(tree)).toContain('- [ ] Root');
  });

  test('undo outdent 恢复被收走的兄弟节点', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const item2Id = childA.children[1].id;
    const item3Id = childA.children[2].id;

    // Indent Item 2 under Item 1
    const indentOp2 = applyOperation(tree, { type: 'indent', nodeId: item2Id });
    // Indent Item 3 under Item 1 (Item 3 was at index 1 of Child A after indent of Item 2, now it goes under Item 1)
    const indentOp3 = applyOperation(tree, { type: 'indent', nodeId: item3Id });

    const item1 = childA.children[0];
    expect(item1.children.length).toBe(2); // Item 2 and Item 3
    expect(item1.children[0].title).toBe('Item 2');
    expect(item1.children[1].title).toBe('Item 3');

    // Outdent Item 2 → Item 3 gets adopted by Item 2
    const outdentOp = applyOperation(tree, { type: 'outdent', nodeId: item2Id });
    undoManager.push([outdentOp]);

    // After outdent, Item 2 moved up to Child A, Item 3 adopted by Item 2
    const item2AfterOutdent = findNode(tree.root, item2Id)!;
    expect(item2AfterOutdent.children.map(c => c.title)).toContain('Item 3');

    // Undo the outdent
    undoManager.undo(tree);

    // Item 2 and Item 3 should both be back under Item 1
    const item1After = findNode(tree.root, item1.id)!;
    expect(item1After.children.length).toBe(2);
    expect(item1After.children[0].title).toBe('Item 2');
    expect(item1After.children[1].title).toBe('Item 3');
  });

  test('连续多次 undo', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const childAId = childA.id;

    const op1 = applyOperation(tree, { type: 'rename', nodeId: childAId, newTitle: 'A1' });
    undoManager.push([op1]);
    const op2 = applyOperation(tree, { type: 'rename', nodeId: childAId, newTitle: 'A2' });
    undoManager.push([op2]);
    const op3 = applyOperation(tree, { type: 'rename', nodeId: childAId, newTitle: 'A3' });
    undoManager.push([op3]);

    expect(childA.title).toBe('A3');

    undoManager.undo(tree);
    expect(childA.title).toBe('A2');

    undoManager.undo(tree);
    expect(childA.title).toBe('A1');

    undoManager.undo(tree);
    expect(childA.title).toBe('Child A');
  });

  test('undo 后新操作清空 redo 栈', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const childAId = childA.id;

    const op1 = applyOperation(tree, { type: 'rename', nodeId: childAId, newTitle: 'A1' });
    undoManager.push([op1]);

    undoManager.undo(tree);
    expect(undoManager.canRedo()).toBe(true);

    // New operation should clear redo stack
    const op2 = applyOperation(tree, { type: 'rename', nodeId: childAId, newTitle: 'A2' });
    undoManager.push([op2]);
    expect(undoManager.canRedo()).toBe(false);
  });

  test('undo 栈超过 100 步时淘汰最老操作', () => {
    const h1 = tree.root.children[0];
    const childA = h1.children[0];
    const childAId = childA.id;

    for (let i = 0; i < 105; i++) {
      const op = applyOperation(tree, { type: 'rename', nodeId: childAId, newTitle: `Title ${i}` });
      undoManager.push([op]);
    }

    // Should be able to undo exactly 100 times
    let undoCount = 0;
    while (undoManager.canUndo()) {
      undoManager.undo(tree);
      undoCount++;
    }
    expect(undoCount).toBe(100);
  });

  test('连续 undo 到栈空不 crash', () => {
    // Undo on empty stack should return null
    const result = undoManager.undo(tree);
    expect(result).toBe(null);

    // Multiple calls on empty should not crash
    expect(undoManager.undo(tree)).toBe(null);
    expect(undoManager.undo(tree)).toBe(null);
    expect(undoManager.canUndo()).toBe(false);
  });
});
