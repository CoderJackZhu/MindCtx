export function importOPML(opmlText: string, fileName: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(opmlText, 'text/xml');

  const error = doc.querySelector('parsererror');
  if (error) {
    throw new Error('OPML 解析失败: ' + error.textContent);
  }

  const body = doc.querySelector('body');
  if (!body) throw new Error('OPML 格式错误: 缺少 body 元素');

  const title = doc.querySelector('head > title')?.textContent || fileName.replace(/\.mind\.md$/, '');
  const headingDepth = 4;

  function convertOutline(element: Element, depth: number): string {
    const text = element.getAttribute('text') || element.getAttribute('TEXT') || '';
    const note = element.getAttribute('_note') || '';
    const children = Array.from(element.children).filter(c => c.tagName.toLowerCase() === 'outline');

    let output = '';

    if (depth <= headingDepth) {
      output += '#'.repeat(depth) + ' ' + text + '\n\n';
      if (note && note !== text) {
        output += note + '\n\n';
      }
    } else {
      const indent = '  '.repeat(depth - headingDepth - 1);
      output += indent + '- ' + text + '\n';
    }

    for (const child of children) {
      output += convertOutline(child, depth + 1);
    }

    return output;
  }

  const topOutlines = Array.from(body.children).filter(c => c.tagName.toLowerCase() === 'outline');

  let markdown = `---\nmindctx: true\ndefault-view: outline\nheading-depth: ${headingDepth}\n---\n\n`;

  if (topOutlines.length === 1) {
    const root = topOutlines[0];
    const rootTitle = root.getAttribute('text') || root.getAttribute('TEXT') || title;
    markdown += `# ${rootTitle}\n\n`;
    const rootChildren = Array.from(root.children).filter(c => c.tagName.toLowerCase() === 'outline');
    for (const child of rootChildren) {
      markdown += convertOutline(child, 2);
    }
  } else {
    markdown += `# ${title}\n\n`;
    for (const outline of topOutlines) {
      markdown += convertOutline(outline, 2);
    }
  }

  return markdown;
}
