export function importFreeMind(xmlText: string, fileName: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const rootNode = doc.querySelector('map > node');
  if (!rootNode) throw new Error('FreeMind 格式错误: 缺少根节点');

  const headingDepth = 4;
  const title = rootNode.getAttribute('TEXT') || fileName.replace(/\.mind\.md$/, '');

  function convert(node: Element, depth: number): string {
    const text = node.getAttribute('TEXT') || '';
    const children = Array.from(node.children).filter(c => c.tagName === 'node');
    let output = '';

    if (depth <= headingDepth) {
      output += '#'.repeat(depth) + ' ' + text + '\n\n';
    } else {
      const indent = '  '.repeat(depth - headingDepth - 1);
      output += indent + '- ' + text + '\n';
    }

    for (const child of children) {
      output += convert(child, depth + 1);
    }
    return output;
  }

  let markdown = `---\nmindctx: true\ndefault-view: outline\nheading-depth: ${headingDepth}\n---\n\n`;
  markdown += `# ${title}\n\n`;
  const children = Array.from(rootNode.children).filter(c => c.tagName === 'node');
  for (const child of children) {
    markdown += convert(child, 2);
  }

  return markdown;
}
