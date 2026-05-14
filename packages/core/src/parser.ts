import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { parse as parseYaml } from 'yaml';
import type { Root, Heading, List, Paragraph, Code, Image, RootContent } from 'mdast';
import type { MindDocNode, MindDocTree, ContentBlock, ParseOptions } from './types.js';
import { generateNodeId } from './hash.js';

interface InlineNode {
  type: string;
  value?: string;
  children?: InlineNode[];
  url?: string;
  alt?: string | null;
}

function extractInlineText(node: InlineNode): string {
  switch (node.type) {
    case 'text':
      return node.value ?? '';
    case 'inlineCode':
      return '`' + (node.value ?? '') + '`';
    case 'strong':
      return '**' + (node.children ?? []).map(extractInlineText).join('') + '**';
    case 'emphasis':
      return '*' + (node.children ?? []).map(extractInlineText).join('') + '*';
    case 'delete':
      return '~~' + (node.children ?? []).map(extractInlineText).join('') + '~~';
    case 'link':
      return '[' + (node.children ?? []).map(extractInlineText).join('') + '](' + (node.url ?? '') + ')';
    case 'image':
      return '![' + (node.alt || '') + '](' + (node.url ?? '') + ')';
    case 'inlineMath':
      return '$' + (node.value ?? '') + '$';
    case 'break':
      return '\n';
    default: {
      if (node.children && Array.isArray(node.children)) {
        return node.children.map(extractInlineText).join('');
      }
      if (node.value !== undefined) {
        return node.value;
      }
      return '';
    }
  }
}

/**
 * Extract #tags from title text.
 */
function extractTags(text: string): string[] {
  const regex = /#([^\s#]+)/g;
  const tags: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    tags.push(match[1]);
  }
  return tags;
}

function normalizeHeadingDepth(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' || typeof value === 'string'
    ? Number(value)
    : NaN;
  const depth = Number.isInteger(parsed) ? parsed : fallback;
  return Math.min(6, Math.max(1, depth));
}

/**
 * Create a blank MindDocNode with defaults.
 */
function createNode(overrides: Partial<MindDocNode> = {}): MindDocNode {
  return {
    id: '',
    title: '',
    note: '',
    blocks: [],
    children: [],
    nodeType: 'heading',
    headingLevel: 0,
    listDepth: 0,
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

/**
 * Get the start line (0-indexed) of an mdast node.
 */
function getStartLine(node: { position?: { start: { line: number } } }): number {
  return node.position ? node.position.start.line - 1 : 0;
}

/**
 * Get the end line (0-indexed, exclusive) of an mdast node.
 */
function getEndLine(node: { position?: { end: { line: number } } }): number {
  return node.position ? node.position.end.line : 0;
}

/**
 * Convert an mdast block node into a ContentBlock.
 */
function toContentBlock(node: RootContent, lines: string[]): ContentBlock {
  const startLine = getStartLine(node);
  const endLine = getEndLine(node);
  const raw = lines.slice(startLine, endLine).join('\n');

  switch (node.type) {
    case 'code':
      return { type: 'code', raw, language: (node as Code).lang || undefined };
    case 'blockquote':
      return { type: 'blockquote', raw };
    case 'table':
      return { type: 'table', raw };
    case 'image':
      return { type: 'image', raw, alt: (node as Image).alt || undefined };
    case 'html':
      return { type: 'html', raw };
    case 'thematicBreak':
      return { type: 'hr', raw };
    case 'math':
      return { type: 'math', raw };
    default:
      return { type: 'html', raw };
  }
}

/**
 * Check if an mdast node is a "block" type (goes into node.blocks).
 */
function isBlockNode(node: RootContent): boolean {
  return ['code', 'blockquote', 'table', 'image', 'html', 'thematicBreak', 'math'].includes(node.type);
}

/**
 * Process a list and return an array of MindDocNodes (one per list item).
 */
function processList(
  listNode: List,
  lines: string[],
  listDepth: number,
): MindDocNode[] {
  const nodes: MindDocNode[] = [];

  for (const item of listNode.children) {
    if (item.type !== 'listItem') continue;

    const node = createNode({
      nodeType: 'list-item',
      listDepth,
      ordered: listNode.ordered === true,
      checked: item.checked ?? null,
      sourceRange: {
        startLine: getStartLine(item),
        endLine: getEndLine(item),
      },
    });

    const noteParagraphs: string[] = [];
    let titleSet = false;

    for (const child of item.children) {
      if (child.type === 'paragraph' && !titleSet) {
        // First paragraph → title
        node.title = (child.children as unknown as InlineNode[]).map(extractInlineText).join('');
        node.tags = extractTags(node.title);
        titleSet = true;
      } else if (child.type === 'paragraph') {
        // Subsequent paragraphs → note
        noteParagraphs.push((child.children as unknown as InlineNode[]).map(extractInlineText).join(''));
      } else if (child.type === 'list') {
        // Nested list → children
        const childNodes = processList(child, lines, listDepth + 1);
        node.children.push(...childNodes);
      } else if (isBlockNode(child)) {
        node.blocks.push(toContentBlock(child, lines));
      }
    }

    node.note = noteParagraphs.join('\n\n');
    nodes.push(node);
  }

  return nodes;
}

/**
 * Parse a Markdown string into a MindDocTree.
 */
export function parse(markdown: string, options?: ParseOptions): MindDocTree {
  const startTime = performance.now();

  const lines = markdown.split('\n');
  const totalLines = lines.length;

  // Step 1: Parse with unified/remark
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMath);

  const mdast = processor.parse(markdown) as Root;

  // Step 2: Extract frontmatter
  let frontmatter: Record<string, unknown> = {};
  let rawFrontmatter = '';
  let frontmatterEndLine = 0; // 0-indexed line AFTER frontmatter ends

  const fmNode = mdast.children.find(c => c.type === 'yaml');
  if (fmNode) {
    try {
      frontmatter = parseYaml((fmNode as { value: string }).value) || {};
    } catch {
      frontmatter = {};
    }
    const fmStart = getStartLine(fmNode);
    const fmEnd = getEndLine(fmNode);
    // rawFrontmatter includes the --- delimiters and trailing blank line separator
    // The fmNode positions cover from the opening --- to the closing ---
    // We include the trailing blank line ONLY if there's content after it (real separator)
    // A blank line at fmEnd that is followed by more content is a separator;
    // if it's the last element (split artifact from trailing \n), it's not.
    if (fmEnd < totalLines && lines[fmEnd] === '' && fmEnd + 1 < totalLines) {
      rawFrontmatter = lines.slice(fmStart, fmEnd + 1).join('\n') + '\n';
      frontmatterEndLine = fmEnd + 1;
    } else {
      rawFrontmatter = lines.slice(fmStart, fmEnd).join('\n') + '\n';
      frontmatterEndLine = fmEnd;
    }
  }

  // Determine headingDepth
  const headingDepth = normalizeHeadingDepth(
    frontmatter['heading-depth'],
    normalizeHeadingDepth(options?.defaultHeadingDepth, 3)
  );

  // Step 3: Create virtual root
  const filePath = options?.filePath || '';
  const fileName = filePath
    ? filePath.replace(/.*[\\/]/, '').replace(/\.mind\.md$/, '').replace(/\.md$/, '')
    : 'Untitled';

  const root = createNode({
    id: '',
    title: fileName,
    nodeType: 'heading',
    headingLevel: 0,
    sourceRange: { startLine: 0, endLine: totalLines },
  });

  // Step 4: Walk mdast children with a stack
  // Stack: each element tracks a node and its heading level for hierarchy
  const stack: { node: MindDocNode; level: number }[] = [{ node: root, level: 0 }];

  // The "current node" is the top of stack for appending notes/blocks
  function currentNode(): MindDocNode {
    return stack[stack.length - 1].node;
  }

  for (const child of mdast.children) {
    if (child.type === 'yaml') {
      // Skip frontmatter; already handled
      continue;
    }

    if (child.type === 'heading') {
      const heading = child as Heading;
      const level = heading.depth;

      // Pop stack until the top has a level < current heading depth
      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      const newNode = createNode({
        nodeType: 'heading',
        headingLevel: level,
        title: (heading.children as unknown as InlineNode[]).map(extractInlineText).join(''),
        sourceRange: {
          startLine: getStartLine(heading),
          endLine: getEndLine(heading),
        },
      });
      newNode.tags = extractTags(newNode.title);

      // Add as child of current stack top
      stack[stack.length - 1].node.children.push(newNode);
      stack.push({ node: newNode, level });
    } else if (child.type === 'list') {
      const listNodes = processList(child as List, lines, 1);
      currentNode().children.push(...listNodes);
    } else if (child.type === 'paragraph') {
      const text = ((child as Paragraph).children as unknown as InlineNode[]).map(extractInlineText).join('');
      if (currentNode().note) {
        currentNode().note += '\n\n' + text;
      } else {
        currentNode().note = text;
      }
    } else if (isBlockNode(child)) {
      currentNode().blocks.push(toContentBlock(child, lines));
    }
  }

  // Step 5: Backfill sourceRange and rawText
  // Collect all nodes (excluding root) in document order sorted by startLine
  const allNodes: MindDocNode[] = [];
  function collectNodes(node: MindDocNode) {
    for (const child of node.children) {
      allNodes.push(child);
      collectNodes(child);
    }
  }
  collectNodes(root);

  // Sort by startLine (document order)
  allNodes.sort((a, b) => a.sourceRange.startLine - b.sourceRange.startLine);

  // Backfill rawText for each node
  for (let i = 0; i < allNodes.length; i++) {
    const node = allNodes[i];
    let ownContentEnd: number;

    if (node.children.length > 0) {
      // If node has children: ownContentEnd = first child's startLine
      // Find the first child in document order
      let firstChildStart = totalLines;
      for (const child of node.children) {
        if (child.sourceRange.startLine < firstChildStart) {
          firstChildStart = child.sourceRange.startLine;
        }
      }
      ownContentEnd = firstChildStart;
    } else {
      // If node has no children: ownContentEnd = next node's startLine (or end of file)
      if (i + 1 < allNodes.length) {
        ownContentEnd = allNodes[i + 1].sourceRange.startLine;
      } else {
        ownContentEnd = totalLines;
      }
    }

    const startLine = node.sourceRange.startLine;
    // Update sourceRange endLine to the ownContentEnd
    node.sourceRange.endLine = ownContentEnd;

    // rawText = lines from startLine to ownContentEnd
    if (startLine < ownContentEnd) {
      const sliced = lines.slice(startLine, ownContentEnd);
      node.rawText = sliced.join('\n');
      // Add trailing newline if not at end of file
      if (ownContentEnd < totalLines) {
        node.rawText += '\n';
      }
    } else {
      node.rawText = '';
    }
  }

  // Backfill virtual root rawText
  if (root.children.length > 0) {
    // Find the first child's startLine
    let firstChildStart = totalLines;
    for (const child of root.children) {
      if (child.sourceRange.startLine < firstChildStart) {
        firstChildStart = child.sourceRange.startLine;
      }
    }
    const rootStart = frontmatterEndLine;
    if (rootStart < firstChildStart) {
      const sliced = lines.slice(rootStart, firstChildStart);
      root.rawText = sliced.join('\n');
      if (firstChildStart < totalLines) {
        root.rawText += '\n';
      }
    } else {
      root.rawText = '';
    }
    root.sourceRange.startLine = rootStart;
    root.sourceRange.endLine = firstChildStart;
  } else {
    // Root has no children: rawText = all content after frontmatter
    const rootStart = frontmatterEndLine;
    if (rootStart < totalLines) {
      root.rawText = lines.slice(rootStart).join('\n');
      // Don't add trailing newline for last content
    } else {
      root.rawText = '';
    }
    root.sourceRange.startLine = rootStart;
    root.sourceRange.endLine = totalLines;
  }

  // Step 6: Generate node IDs
  function assignIds(node: MindDocNode, titlePath: string[]) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const childPath = [...titlePath, child.title];
      child.id = generateNodeId(childPath, i);
      assignIds(child, childPath);
    }
  }
  assignIds(root, []);

  // Step 7: Compute metadata
  let nodeCount = 0;
  let maxDepth = 0;

  function computeMeta(node: MindDocNode, depth: number) {
    nodeCount++;
    if (depth > maxDepth) maxDepth = depth;
    for (const child of node.children) {
      computeMeta(child, depth + 1);
    }
  }
  computeMeta(root, 0);

  const parseTime = performance.now() - startTime;

  return {
    version: 1,
    filePath,
    frontmatter,
    rawFrontmatter,
    headingDepth,
    root,
    metadata: {
      parseTime,
      nodeCount,
      maxDepth,
    },
  };
}
