import type { MindDocTree, Operation } from './types.js';
import { findNode, findParent, findIndex, getAbsoluteDepth, recalculateNodeTypes } from './operations.js';

export function invertOperation(op: Operation): Operation[] {
  switch (op.type) {
    case 'move':
      return [{ type: 'move', nodeId: op.nodeId, newParentId: op.oldParentId, index: op.oldIndex, oldParentId: op.newParentId, oldIndex: op.index }];

    case 'rename':
      return [{ type: 'rename', nodeId: op.nodeId, newTitle: op.oldTitle, oldTitle: op.newTitle }];

    case 'create':
      return [{ type: 'delete', nodeId: op.node.id, parentId: op.parentId, index: op.index, deletedNode: op.node }];

    case 'delete':
      return [{ type: 'create', parentId: op.parentId, index: op.index, node: op.deletedNode }];

    case 'indent':
      // Indent moved node into previous sibling. Undo = move back to original parent at original index
      return [{ type: 'move', nodeId: op.nodeId, newParentId: op.oldParentId, index: op.oldIndex, oldParentId: '', oldIndex: -1 }];

    case 'outdent': {
      // Outdent moved node up and adopted siblings. Undo = move node back, then move adopted siblings back
      const ops: Operation[] = [
        { type: 'move', nodeId: op.nodeId, newParentId: op.oldParentId, index: op.oldIndex, oldParentId: '', oldIndex: -1 },
      ];
      for (let i = 0; i < op.adoptedSiblingIds.length; i++) {
        ops.push({
          type: 'move',
          nodeId: op.adoptedSiblingIds[i],
          newParentId: op.oldParentId,
          index: op.oldIndex + 1 + i,
          oldParentId: op.nodeId,
          oldIndex: -1,
        });
      }
      return ops;
    }

    case 'toggleCheck':
      // Restore oldValue directly (not cycle again)
      return [{ type: 'toggleCheck', nodeId: op.nodeId, oldValue: op.oldValue }];

    case 'updateNote':
      return [{ type: 'updateNote', nodeId: op.nodeId, note: op.oldNote, oldNote: op.note }];

    case 'moveUp':
      return [{ type: 'moveDown', nodeId: op.nodeId }];

    case 'moveDown':
      return [{ type: 'moveUp', nodeId: op.nodeId }];
  }
}

// Execute an Operation directly on the tree (used by undo/redo)
function executeOperation(tree: MindDocTree, op: Operation): Operation {
  const root = tree.root;

  switch (op.type) {
    case 'move': {
      const node = findNode(root, op.nodeId)!;
      const currentParent = findParent(root, op.nodeId)!;
      const currentIndex = findIndex(currentParent, op.nodeId);
      currentParent.children.splice(currentIndex, 1);

      const newParent = findNode(root, op.newParentId)!;
      const insertIdx = op.index === -1 ? newParent.children.length : op.index;
      newParent.children.splice(insertIdx, 0, node);

      node.dirty = true;
      const depth = getAbsoluteDepth(root, op.nodeId);
      recalculateNodeTypes(node, depth, tree.headingDepth);
      return { ...op, oldParentId: currentParent.id, oldIndex: currentIndex };
    }

    case 'rename': {
      const node = findNode(root, op.nodeId)!;
      const oldTitle = node.title;
      node.title = op.newTitle;
      node.dirty = true;
      return { ...op, oldTitle };
    }

    case 'create': {
      const parent = findNode(root, op.parentId)!;
      const insertIdx = op.index === -1 ? parent.children.length : op.index;
      parent.children.splice(insertIdx, 0, op.node);
      op.node.dirty = true;
      return op;
    }

    case 'delete': {
      const parent = findNode(root, op.parentId)!;
      const index = findIndex(parent, op.nodeId);
      const deletedNode = parent.children.splice(index, 1)[0];
      return { ...op, deletedNode };
    }

    case 'toggleCheck': {
      // For undo: directly set to oldValue (not cycle)
      const node = findNode(root, op.nodeId)!;
      const currentValue = node.checked;
      node.checked = op.oldValue;
      node.dirty = true;
      return { type: 'toggleCheck', nodeId: op.nodeId, oldValue: currentValue };
    }

    case 'updateNote': {
      const node = findNode(root, op.nodeId)!;
      const currentNote = node.note;
      node.note = op.note;
      node.dirty = true;
      return { type: 'updateNote', nodeId: op.nodeId, note: op.note, oldNote: currentNote };
    }

    case 'moveUp': {
      const parent = findParent(root, op.nodeId)!;
      const index = findIndex(parent, op.nodeId);
      if (index > 0) {
        [parent.children[index - 1], parent.children[index]] = [parent.children[index], parent.children[index - 1]];
      }
      return op;
    }

    case 'moveDown': {
      const parent = findParent(root, op.nodeId)!;
      const index = findIndex(parent, op.nodeId);
      if (index < parent.children.length - 1) {
        [parent.children[index], parent.children[index + 1]] = [parent.children[index + 1], parent.children[index]];
      }
      return op;
    }

    case 'indent':
    case 'outdent':
      throw new Error(`Unexpected operation type in executeOperation: ${op.type}`);
  }
}

export class UndoManager {
  private undoStack: Operation[][] = [];
  private redoStack: Operation[][] = [];
  private maxSize = 100;

  push(ops: Operation[]): void {
    this.undoStack.push(ops);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(tree: MindDocTree): Operation[] | null {
    const ops = this.undoStack.pop();
    if (!ops) return null;

    const executedOps: Operation[] = [];
    // Process operations in reverse order for undo
    for (let i = ops.length - 1; i >= 0; i--) {
      const inverted = invertOperation(ops[i]);
      for (const inv of inverted) {
        const result = executeOperation(tree, inv);
        executedOps.push(result);
      }
    }

    this.redoStack.push(ops);
    return executedOps;
  }

  redo(tree: MindDocTree): Operation[] | null {
    const ops = this.redoStack.pop();
    if (!ops) return null;

    const results: Operation[] = [];
    for (const op of ops) {
      const result = executeOperation(tree, op);
      results.push(result);
    }

    this.undoStack.push(ops);
    return results;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
