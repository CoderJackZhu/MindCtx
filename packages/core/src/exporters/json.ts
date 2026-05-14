import type { MindDocTree, MindDocNode } from '../types.js';

interface SimplifiedNode {
  title: string;
  note?: string;
  tags?: string[];
  checked?: boolean;
  children?: SimplifiedNode[];
}

export function exportJSON(tree: MindDocTree): string {
  function simplify(node: MindDocNode): SimplifiedNode {
    const obj: SimplifiedNode = { title: node.title };
    if (node.note) obj.note = node.note;
    if (node.tags.length > 0) obj.tags = node.tags;
    if (node.checked !== null) obj.checked = node.checked;
    if (node.children.length > 0) {
      obj.children = node.children.map(simplify);
    }
    return obj;
  }

  return JSON.stringify({
    version: 1,
    root: simplify(tree.root),
  }, null, 2);
}
