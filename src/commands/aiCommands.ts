import type { MindDocTree, MindDocNode } from '../core/types.js';

export function copyAsAIContext(tree: MindDocTree): string {
  const headingDepth = tree.headingDepth;

  function nodeToMarkdown(node: MindDocNode, depth: number): string {
    let output = '';

    if (depth === 0) {
      output += `# ${node.title}\n\n`;
    } else if (depth <= headingDepth) {
      output += '#'.repeat(depth + 1) + ' ' + node.title + '\n\n';
    } else {
      output += '  '.repeat(depth - headingDepth) + '- ' + node.title + '\n';
    }

    if (node.note) {
      output += node.note + '\n\n';
    }

    for (const child of node.children) {
      output += nodeToMarkdown(child, depth + 1);
    }

    return output;
  }

  let result = `以下是文档 "${tree.root.title}" 的结构化内容：\n\n`;
  result += nodeToMarkdown(tree.root, 0);
  result += `\n---\n`;
  result += `格式说明：这是一个 Markdown 树结构文档。标题层级表示节点深度，列表项表示叶子节点。\n`;
  result += `修改时请保持 Markdown 层级结构，不要输出 JSON，不要改变 frontmatter。\n`;

  return result;
}
