import { describe, test, expect, beforeEach } from 'vitest';
import { UndoManager, invertOperation } from '../src/core/undo.js';
import { parse } from '../src/core/parser.js';
import type { Operation, MindDocNode } from '../src/core/types.js';

const simpleMd = `---
minddoc: true
---

# Root

## Child A

- Item 1
- Item 2
- Item 3

## Child B

- Item B1
`;

function makeTree(): ReturnType<typeof parse> {
  return parse(simpleMd);
}

function makeNode(overrides: Partial<MindDocNode> = {}): MindDocNode {
  return {
    id: 'new-node',
    title: 'New Node',
    note: '',
    blocks: [],
    children: [],
    nodeType: 'list-item',
    headingLevel: 0,
    listDepth: 1,
    checked: null,
    tags: [],
    ordered: false,
    sourceRange: { startLine: 0, endLine: 0 },
    rawText: '',
    dirty: false,
    subtreeDirty: false,
    ...overrides,
  };
}

describe('UndoManager', () => {
  let tree: ReturnType<typeof parse>;
  let undoManager: UndoManager;
  let childA: MindDocNode;
  let childB: MindDocNode;
  let item1: MindDocNode;
  let item2: MindDocNode;

  beforeEach(() => {
    tree = makeTree();
    undoManager = new UndoManager();

    const h1 = tree.root.children[0];
    childA = h1.children[0];
    childB = h1.children[1];
    item1 = childA.children[0];
    item2 = childA.children[1];
  });

  test('undo flow: push rename op then undo restores title', () => {
    const op: Operation = { type: 'rename', nodeId: childA.id, oldTitle: 'Child A', newTitle: 'Renamed' };
    childA.title = 'Renamed';

    undoManager.push([op]);
    const undone = undoManager.undo(tree);

    expect(undone).not.toBeNull();
    expect(childA.title).toBe('Child A');
  });

  test('redo after undo restores renamed title', () => {
    const op: Operation = { type: 'rename', nodeId: childA.id, oldTitle: 'Child A', newTitle: 'Renamed' };
    childA.title = 'Renamed';
    undoManager.push([op]);

    undoManager.undo(tree);
    expect(childA.title).toBe('Child A');

    const redone = undoManager.redo(tree);

    expect(redone).not.toBeNull();
    expect(childA.title).toBe('Renamed');
  });

  test('canUndo and canRedo reflect push and clear state', () => {
    const op: Operation = { type: 'rename', nodeId: childA.id, oldTitle: 'Child A', newTitle: 'Renamed' };

    expect(undoManager.canUndo()).toBe(false);
    expect(undoManager.canRedo()).toBe(false);

    undoManager.push([op]);

    expect(undoManager.canUndo()).toBe(true);
    expect(undoManager.canRedo()).toBe(false);

    undoManager.clear();

    expect(undoManager.canUndo()).toBe(false);
    expect(undoManager.canRedo()).toBe(false);
  });

  test('clear empties both undo and redo stacks', () => {
    const op: Operation = { type: 'rename', nodeId: childA.id, oldTitle: 'Child A', newTitle: 'Renamed' };
    childA.title = 'Renamed';
    undoManager.push([op]);
    undoManager.undo(tree);

    expect(undoManager.canRedo()).toBe(true);

    undoManager.clear();

    expect(undoManager.canUndo()).toBe(false);
    expect(undoManager.canRedo()).toBe(false);
    expect(undoManager.undo(tree)).toBeNull();
    expect(undoManager.redo(tree)).toBeNull();
  });

  test('undo empty stack returns null', () => {
    expect(undoManager.undo(tree)).toBeNull();
  });

  test('redo empty stack returns null', () => {
    expect(undoManager.redo(tree)).toBeNull();
  });

  test('push clears redo stack', () => {
    const op1: Operation = { type: 'rename', nodeId: childA.id, oldTitle: 'Child A', newTitle: 'Renamed 1' };
    childA.title = 'Renamed 1';
    undoManager.push([op1]);
    undoManager.undo(tree);

    expect(undoManager.canRedo()).toBe(true);

    const op2: Operation = { type: 'rename', nodeId: childA.id, oldTitle: 'Child A', newTitle: 'Renamed 2' };
    childA.title = 'Renamed 2';
    undoManager.push([op2]);

    expect(undoManager.canRedo()).toBe(false);
    expect(undoManager.redo(tree)).toBeNull();
  });

  test('maxSize drops the first operation after pushing 101 items', () => {
    let previousTitle = childA.title;

    for (let i = 0; i < 101; i++) {
      const nextTitle = `Title ${i}`;
      const op: Operation = { type: 'rename', nodeId: childA.id, oldTitle: previousTitle, newTitle: nextTitle };
      childA.title = nextTitle;
      undoManager.push([op]);
      previousTitle = nextTitle;
    }

    let undoCount = 0;
    while (undoManager.canUndo()) {
      undoManager.undo(tree);
      undoCount++;
    }

    expect(undoCount).toBe(100);
    expect(childA.title).toBe('Title 0');
  });

  test('invertOperation returns move back for move', () => {
    const op: Operation = {
      type: 'move',
      nodeId: item1.id,
      newParentId: childB.id,
      index: 1,
      oldParentId: childA.id,
      oldIndex: 0,
    };

    expect(invertOperation(op)).toEqual([
      { type: 'move', nodeId: item1.id, newParentId: childA.id, index: 0, oldParentId: childB.id, oldIndex: 1 },
    ]);
  });

  test('invertOperation swaps titles for rename', () => {
    const op: Operation = { type: 'rename', nodeId: childA.id, oldTitle: 'Child A', newTitle: 'Renamed' };

    expect(invertOperation(op)).toEqual([
      { type: 'rename', nodeId: childA.id, oldTitle: 'Renamed', newTitle: 'Child A' },
    ]);
  });

  test('invertOperation gives delete for create', () => {
    const node = makeNode();
    const op: Operation = { type: 'create', parentId: childA.id, index: 1, node };

    expect(invertOperation(op)).toEqual([
      { type: 'delete', nodeId: node.id, parentId: childA.id, index: 1, deletedNode: node },
    ]);
  });

  test('invertOperation gives create for delete', () => {
    const op: Operation = { type: 'delete', nodeId: item1.id, parentId: childA.id, index: 0, deletedNode: item1 };

    expect(invertOperation(op)).toEqual([
      { type: 'create', parentId: childA.id, index: 0, node: item1 },
    ]);
  });

  test('invertOperation swaps values for toggleCheck', () => {
    const op: Operation = {
      type: 'toggleCheck',
      nodeId: item1.id,
      oldValue: null,
      newValue: false,
      oldNodeType: 'heading',
      oldHeadingLevel: 2,
      oldListDepth: 0,
      newNodeType: 'list-item',
      newHeadingLevel: 0,
      newListDepth: 1,
    };

    expect(invertOperation(op)).toEqual([
      {
        type: 'toggleCheck',
        nodeId: item1.id,
        oldValue: false,
        newValue: null,
        oldNodeType: 'list-item',
        oldHeadingLevel: 0,
        oldListDepth: 1,
        newNodeType: 'heading',
        newHeadingLevel: 2,
        newListDepth: 0,
      },
    ]);
  });

  test('invertOperation swaps notes for updateNote', () => {
    const op: Operation = { type: 'updateNote', nodeId: item1.id, oldNote: 'Old note', note: 'New note' };

    expect(invertOperation(op)).toEqual([
      { type: 'updateNote', nodeId: item1.id, oldNote: 'New note', note: 'Old note' },
    ]);
  });

  test('invertOperation gives moveDown for moveUp', () => {
    const op: Operation = { type: 'moveUp', nodeId: item2.id };

    expect(invertOperation(op)).toEqual([{ type: 'moveDown', nodeId: item2.id }]);
  });

  test('invertOperation gives moveUp for moveDown', () => {
    const op: Operation = { type: 'moveDown', nodeId: item1.id };

    expect(invertOperation(op)).toEqual([{ type: 'moveUp', nodeId: item1.id }]);
  });

  test('undo group of operations restores all in reverse', () => {
    const renameChild: Operation = { type: 'rename', nodeId: childA.id, oldTitle: 'Child A', newTitle: 'Renamed A' };
    const renameItem: Operation = { type: 'rename', nodeId: item1.id, oldTitle: 'Item 1', newTitle: 'Renamed Item' };
    childA.title = 'Renamed A';
    item1.title = 'Renamed Item';
    undoManager.push([renameChild, renameItem]);

    const undone = undoManager.undo(tree);

    expect(undone).not.toBeNull();
    expect(childA.title).toBe('Child A');
    expect(item1.title).toBe('Item 1');
  });

  test('redo group restores all forward', () => {
    const renameChild: Operation = { type: 'rename', nodeId: childA.id, oldTitle: 'Child A', newTitle: 'Renamed A' };
    const renameItem: Operation = { type: 'rename', nodeId: item1.id, oldTitle: 'Item 1', newTitle: 'Renamed Item' };
    childA.title = 'Renamed A';
    item1.title = 'Renamed Item';
    undoManager.push([renameChild, renameItem]);

    undoManager.undo(tree);
    expect(childA.title).toBe('Child A');
    expect(item1.title).toBe('Item 1');

    const redone = undoManager.redo(tree);

    expect(redone).not.toBeNull();
    expect(childA.title).toBe('Renamed A');
    expect(item1.title).toBe('Renamed Item');
  });
});
