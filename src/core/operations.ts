import type { MindDocNode, MindDocTree, PartialOperation, Operation } from './types.js';
import { generateNodeId } from './hash.js';

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
    node.listDepth = absoluteDepth - headingDepth - 1;
  }
  for (const child of node.children) {
    recalculateNodeTypes(child, absoluteDepth + 1, headingDepth);
  }
}

function bubbleSubtreeDirty(root: MindDocNode, nodeId: string): void {
  function walkAndMark(current: MindDocNode): boolean {
    if (current.id === nodeId) return true;
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
      const node = findNode(root, op.nodeId)!;
      const oldParent = findParent(root, op.nodeId)!;
      const oldIndex = findIndex(oldParent, op.nodeId);
      oldParent.children.splice(oldIndex, 1);

      const newParent = findNode(root, op.newParentId)!;
      const insertIdx = op.index === -1 ? newParent.children.length : op.index;
      newParent.children.splice(insertIdx, 0, node);

      node.dirty = true;
      const depth = getAbsoluteDepth(root, op.nodeId);
      recalculateNodeTypes(node, depth, tree.headingDepth);
      bubbleSubtreeDirty(root, op.nodeId);

      return { type: 'move', nodeId: op.nodeId, newParentId: op.newParentId, index: insertIdx, oldParentId: oldParent.id, oldIndex };
    }

    case 'rename': {
      const node = findNode(root, op.nodeId)!;
      const oldTitle = node.title;
      node.title = op.newTitle;
      node.tags = extractTagsFromTitle(op.newTitle);
      node.dirty = true;
      bubbleSubtreeDirty(root, op.nodeId);
      return { type: 'rename', nodeId: op.nodeId, newTitle: op.newTitle, oldTitle };
    }

    case 'create': {
      const parent = findNode(root, op.parentId)!;
      const insertIdx = op.index === -1 ? parent.children.length : op.index;
      const depth = getAbsoluteDepth(root, op.parentId) + 1;

      const node: MindDocNode = {
        id: generateNodeId([op.title], Date.now() % 1000),
        title: op.title,
        note: '',
        blocks: [],
        children: [],
        nodeType: depth <= tree.headingDepth ? 'heading' : 'list-item',
        headingLevel: depth <= tree.headingDepth ? depth : 0,
        listDepth: depth > tree.headingDepth ? depth - tree.headingDepth - 1 : 0,
        checked: null,
        tags: extractTagsFromTitle(op.title),
        ordered: false,
        sourceRange: { startLine: 0, endLine: 0 },
        rawText: '',
        dirty: true,
        subtreeDirty: false,
      };

      parent.children.splice(insertIdx, 0, node);
      bubbleSubtreeDirty(root, node.id);
      return { type: 'create', parentId: op.parentId, index: insertIdx, node };
    }

    case 'delete': {
      const parent = findParent(root, op.nodeId)!;
      const index = findIndex(parent, op.nodeId);
      const deletedNode = parent.children.splice(index, 1)[0];
      bubbleSubtreeDirty(root, parent.id);
      return { type: 'delete', nodeId: op.nodeId, parentId: parent.id, index, deletedNode };
    }

    case 'indent': {
      const parent = findParent(root, op.nodeId)!;
      const index = findIndex(parent, op.nodeId);
      if (index === 0) throw new Error('Cannot indent: no previous sibling');

      const node = parent.children.splice(index, 1)[0];
      const newParent = parent.children[index - 1];
      newParent.children.push(node);

      node.dirty = true;
      const depth = getAbsoluteDepth(root, op.nodeId);
      recalculateNodeTypes(node, depth, tree.headingDepth);
      bubbleSubtreeDirty(root, op.nodeId);

      return { type: 'indent', nodeId: op.nodeId, oldParentId: parent.id, oldIndex: index };
    }

    case 'outdent': {
      const parent = findParent(root, op.nodeId)!;
      const grandParent = findParent(root, parent.id);
      if (!grandParent) throw new Error('Cannot outdent: parent is root');

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
      bubbleSubtreeDirty(root, op.nodeId);

      return { type: 'outdent', nodeId: op.nodeId, oldParentId: parent.id, oldIndex: index, adoptedSiblingIds };
    }

    case 'toggleCheck': {
      const node = findNode(root, op.nodeId)!;
      const oldValue = node.checked;

      // Convert heading to list-item if needed
      if (node.nodeType === 'heading') {
        const depth = getAbsoluteDepth(root, op.nodeId);
        node.nodeType = 'list-item';
        node.headingLevel = 0;
        node.listDepth = depth > tree.headingDepth ? depth - tree.headingDepth - 1 : 0;
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
      bubbleSubtreeDirty(root, op.nodeId);
      return { type: 'toggleCheck', nodeId: op.nodeId, oldValue };
    }

    case 'updateNote': {
      const node = findNode(root, op.nodeId)!;
      const oldNote = node.note;
      node.note = op.note;
      node.dirty = true;
      bubbleSubtreeDirty(root, op.nodeId);
      return { type: 'updateNote', nodeId: op.nodeId, note: op.note, oldNote };
    }

    case 'moveUp': {
      const parent = findParent(root, op.nodeId)!;
      const index = findIndex(parent, op.nodeId);
      if (index === 0) throw new Error('Cannot moveUp: already first');
      [parent.children[index - 1], parent.children[index]] = [parent.children[index], parent.children[index - 1]];
      bubbleSubtreeDirty(root, parent.id);
      return { type: 'moveUp', nodeId: op.nodeId };
    }

    case 'moveDown': {
      const parent = findParent(root, op.nodeId)!;
      const index = findIndex(parent, op.nodeId);
      if (index === parent.children.length - 1) throw new Error('Cannot moveDown: already last');
      [parent.children[index], parent.children[index + 1]] = [parent.children[index + 1], parent.children[index]];
      bubbleSubtreeDirty(root, parent.id);
      return { type: 'moveDown', nodeId: op.nodeId };
    }
  }
}
