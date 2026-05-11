import type { MindDocTree, MindDocNode } from '../core/types.js';

export function exportOPML(tree: MindDocTree): string {
  function nodeToOutline(node: MindDocNode): string {
    const escaped = escapeXml(node.title);
    const noteAttr = node.note ? ` _note="${escapeXml(node.note)}"` : '';

    if (node.children.length === 0) {
      return `<outline text="${escaped}"${noteAttr}/>`;
    }

    const children = node.children.map(nodeToOutline).join('\n');
    return `<outline text="${escaped}"${noteAttr}>\n${children}\n</outline>`;
  }

  const body = tree.root.children.map(nodeToOutline).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(tree.root.title)}</title>
  </head>
  <body>
    <outline text="${escapeXml(tree.root.title)}">
      ${body}
    </outline>
  </body>
</opml>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
