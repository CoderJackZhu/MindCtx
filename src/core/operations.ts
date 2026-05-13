import type { MindDocNode, MindDocTree, PartialOperation, Operation } from './types.js';
import { generateNodeId } from './hash.js';

let createdNodeCounter = 0;

export function findNode(root: MindDocNode, id: string): MindDocNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function findParent(root: MindDocNode, id: string): MindDocNode | null {
  for (const child of root.children) {
    if (child.id === id) return root;
    const found = findParent(child, id);
    if (found) return found;
  }
  return null;
}

export function findIndex(parent: MindDocNode, id: string): number {
  return parent.children.findIndex(c => c.id === id);
}

export function getAbsoluteDepth(root: MindDocNode, id: string): number {
  function search(node: MindDocNode, depth: number): number {
    if (node.id === id) return depth;
    for (const child of node.children) {
      const result = search(child, depth + 1);
      if (result >= 0) return result;
    }
    return -1;
  }
  return search(root, 0);
}

export function recalculateNodeTypes(node: MindDocNode, absoluteDepth: number, headingDepth: number): void {
  if (absoluteDepth <= headingDepth) {
    node.nodeType = 'heading';
    node.headingLevel = absoluteDepth;
    node.listDepth = 0;
  } else {
    node.nodeType = 'list-item';
    node.headingLevel = 0;
    node.listDepth = absoluteDepth - headingDepth;
  }
  for (const child of node.children) {
    recalculateNodeTypes(child, absoluteDepth + 1, headingDepth);
  }
}

function markSubtreeDirtyPath(root: MindDocNode, nodeId: string): void {
  function walkAndMark(current: MindDocNode): boolean {
    if (current.id === nodeId) {
      current.subtreeDirty = true;
      return true;
    }
    for (const child of current.children) {
      if (walkAndMark(child)) {
        current.subtreeDirty = true;
        return true;
      }
    }
    return false;
  }
  walkAndMark(root);
}

function requireNode(root: MindDocNode, id: string, role = 'node'): MindDocNode {
  const node = findNode(root, id);
  if (!node) throw new Error(`Cannot find ${role}: ${id}`);
  return node;
}

function requireParent(root: MindDocNode, id: string): MindDocNode {
  const parent = findParent(root, id);
  if (!parent) throw new Error(`Cannot find parent for node: ${id}`);
  return parent;
}

function normalizeInsertIndex(index: number, length: number): number {
  if (index === -1) return length;
  return Math.min(Math.max(index, 0), length);
}

function normalizeMoveIndex(index: number, oldParent: MindDocNode, newParent: MindDocNode, oldIndex: number): number {
  const insertIdx = normalizeInsertIndex(index, newParent.children.length);
  return oldParent === newParent && insertIdx > oldIndex ? insertIdx - 1 : insertIdx;
}

function isDescendant(node: MindDocNode, maybeDescendantId: string): boolean {
  for (const child of node.children) {
    if (child.id === maybeDescendantId || isDescendant(child, maybeDescendantId)) {
      return true;
    }
  }
  return false;
}

function getTitlePath(root: MindDocNode, id: string): string[] {
  function search(node: MindDocNode, path: string[]): string[] | null {
    if (node.id === id) return path;
    for (const child of node.children) {
      const result = search(child, [...path, child.title]);
      if (result) return result;
    }
    return null;
  }
  return search(root, []) ?? [];
}

function extractTagsFromTitle(title: string): string[] {
  const tagRegex = /#([^\s#]+)/g;
  const tags: string[] = [];
  let match;
  while ((match = tagRegex.exec(title)) !== null) {
    tags.push(match[1]);
  }
  return tags;
}

export function applyOperation(tree: MindDocTree, op: PartialOperation): Operation {
  const root = tree.root;

  switch (op.type) {
    case 'move': {
      const node = requireNode(root, op.nodeId);
      const oldParent = requireParent(root, op.nodeId);
      const oldIndex = findIndex(oldParent, op.nodeId);
      if (oldIndex < 0) throw new Error(`Cannot move: node is not a child of its parent: ${op.nodeId}`);
      if (op.nodeId === op.newParentId || isDescendant(node, op.newParentId)) {
        throw new Error('Cannot move: target parent is the node itself or its descendant');
      }
      const newParent = requireNode(root, op.newParentId, 'new parent');
      oldParent.children.splice(oldIndex, 1);

      const insertIdx = normalizeMoveIndex(op.index, oldParent, newParent, oldIndex);
      newParent.children.splice(insertIdx, 0, node);

      node.dirty = true;
      if (oldParent !== newParent) {
        const depth = getAbsoluteDepth(root, op.nodeId);
        recalculateNodeTypes(node, depth, tree.headingDepth);
      }
      markSubtreeDirtyPath(root, oldParent.id);
      markSubtreeDirtyPath(root, newParent.id);
      markSubtreeDirtyPath(root, op.nodeId);

      return { type: 'move', nodeId: op.nodeId, newParentId: op.newParentId, index: insertIdx, oldParentId: oldParent.id, oldIndex };
    }

    case 'rename': {
      const node = requireNode(root, op.nodeId);
      const oldTitle = node.title;
      node.title = op.newTitle;
      node.tags = extractTagsFromTitle(op.newTitle);
      node.dirty = true;
      markSubtreeDirtyPath(root, op.nodeId);
      return { type: 'rename', nodeId: op.nodeId, newTitle: op.newTitle, oldTitle };
    }

    case 'create': {
      const parent = requireNode(root, op.parentId, 'parent');
      const insertIdx = normalizeInsertIndex(op.index, parent.children.length);
      const depth = getAbsoluteDepth(root, op.parentId) + 1;
      const titlePathPart = op.title || `_empty_${Date.now()}_${createdNodeCounter++}`;
      const parentPath = getTitlePath(root, op.parentId);

      const node: MindDocNode = {
        id: generateNodeId([...parentPath, titlePathPart], insertIdx),
        title: op.title,
        note: '',
        blocks: [],
        children: [],
        nodeType: depth <= tree.headingDepth ? 'heading' : 'list-item',
        headingLevel: depth <= tree.headingDepth ? depth : 0,
        listDepth: depth > tree.headingDepth ? depth - tree.headingDepth : 0,
        checked: null,
        tags: extractTagsFromTitle(op.title),
        ordered: false,
        sourceRange: { startLine: 0, endLine: 0 },
        rawText: '',
        dirty: true,
        subtreeDirty: false,
      };

      parent.children.splice(insertIdx, 0, node);
      markSubtreeDirtyPath(root, op.parentId);
      return { type: 'create', parentId: op.parentId, index: insertIdx, node };
    }

    case 'delete': {
      const parent = requireParent(root, op.nodeId);
      const index = findIndex(parent, op.nodeId);
      if (index < 0) throw new Error(`Cannot delete: node is not a child of its parent: ${op.nodeId}`);
      const deletedNode = parent.children.splice(index, 1)[0];
      markSubtreeDirtyPath(root, parent.id);
      return { type: 'delete', nodeId: op.nodeId, parentId: parent.id, index, deletedNode };
    }

    case 'indent': {
      const parent = requireParent(root, op.nodeId);
      const index = findIndex(parent, op.nodeId);
      if (index === 0) return { type: 'indent', nodeId: op.nodeId, oldParentId: parent.id, oldIndex: index };

      const node = parent.children.splice(index, 1)[0];
      const newParent = parent.children[index - 1];
      newParent.children.push(node);

      node.dirty = true;
      const depth = getAbsoluteDepth(root, op.nodeId);
      recalculateNodeTypes(node, depth, tree.headingDepth);
      markSubtreeDirtyPath(root, parent.id);
      markSubtreeDirtyPath(root, newParent.id);
      markSubtreeDirtyPath(root, op.nodeId);

      return { type: 'indent', nodeId: op.nodeId, oldParentId: parent.id, oldIndex: index };
    }

    case 'outdent': {
      const parent = requireParent(root, op.nodeId);
      const grandParent = findParent(root, parent.id);
      if (!grandParent) {
        const index = findIndex(parent, op.nodeId);
        return { type: 'outdent', nodeId: op.nodeId, oldParentId: parent.id, oldIndex: index, adoptedSiblingIds: [] };
      }

      const index = findIndex(parent, op.nodeId);
      const node = parent.children.splice(index, 1)[0];

      // Adopt remaining siblings after this node's original position
      const adoptedSiblings = parent.children.splice(index);
      const adoptedSiblingIds = adoptedSiblings.map(s => s.id);
      node.children.push(...adoptedSiblings);

      // Insert after parent in grandparent's children
      const parentIndex = findIndex(grandParent, parent.id);
      grandParent.children.splice(parentIndex + 1, 0, node);

      node.dirty = true;
      const depth = getAbsoluteDepth(root, op.nodeId);
      recalculateNodeTypes(node, depth, tree.headingDepth);
      markSubtreeDirtyPath(root, parent.id);
      markSubtreeDirtyPath(root, grandParent.id);
      markSubtreeDirtyPath(root, op.nodeId);

      return { type: 'outdent', nodeId: op.nodeId, oldParentId: parent.id, oldIndex: index, adoptedSiblingIds };
    }

    case 'toggleCheck': {
      const node = requireNode(root, op.nodeId);
      const oldValue = node.checked;
      const oldNodeType = node.nodeType;
      const oldHeadingLevel = node.headingLevel;
      const oldListDepth = node.listDepth;

      // Convert heading to list-item if needed
      if (node.nodeType === 'heading') {
        const depth = getAbsoluteDepth(root, op.nodeId);
        node.nodeType = 'list-item';
        node.headingLevel = 0;
        node.listDepth = depth > tree.headingDepth ? depth - tree.headingDepth : 0;
      }

      // Cycle: null -> false -> true -> null
      if (node.checked === null) {
        node.checked = false;
      } else if (node.checked === false) {
        node.checked = true;
      } else {
        node.checked = null;
      }

      node.dirty = true;
      markSubtreeDirtyPath(root, op.nodeId);
      return {
        type: 'toggleCheck',
        nodeId: op.nodeId,
        oldValue,
        newValue: node.checked,
        oldNodeType,
        oldHeadingLevel,
        oldListDepth,
        newNodeType: node.nodeType,
        newHeadingLevel: node.headingLevel,
        newListDepth: node.listDepth,
      };
    }

    case 'updateNote': {
      const node = requireNode(root, op.nodeId);
      const oldNote = node.note;
      node.note = op.note;
      node.dirty = true;
      markSubtreeDirtyPath(root, op.nodeId);
      return { type: 'updateNote', nodeId: op.nodeId, note: op.note, oldNote };
    }

    case 'moveUp': {
      const parent = requireParent(root, op.nodeId);
      const index = findIndex(parent, op.nodeId);
      if (index === 0) return { type: 'moveUp', nodeId: op.nodeId };
      [parent.children[index - 1], parent.children[index]] = [parent.children[index], parent.children[index - 1]];
      markSubtreeDirtyPath(root, parent.id);
      return { type: 'moveUp', nodeId: op.nodeId };
    }

    case 'moveDown': {
      const parent = requireParent(root, op.nodeId);
      const index = findIndex(parent, op.nodeId);
      if (index === parent.children.length - 1) return { type: 'moveDown', nodeId: op.nodeId };
      [parent.children[index], parent.children[index + 1]] = [parent.children[index + 1], parent.children[index]];
      markSubtreeDirtyPath(root, parent.id);
      return { type: 'moveDown', nodeId: op.nodeId };
    }
  }
}
