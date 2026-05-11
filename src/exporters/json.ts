import type { MindDocTree, MindDocNode } from '../core/types.js';

export function exportJSON(tree: MindDocTree): string {
  function simplify(node: MindDocNode): any {
    const obj: any = { title: node.title };
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
