import type { MindCtxNode, MindCtxTree, SerializeOptions } from './types.js';

/**
 * Serialize a MindCtxTree back to Markdown text.
 *
 * Round-trip fidelity: for unmodified trees, serialize(parse(text)) === text.
 * This is achieved by outputting rawText verbatim for clean nodes (dirty === false),
 * and only regenerating content from structured data for dirty nodes.
 */
export function serialize(tree: MindCtxTree, options?: SerializeOptions): string {
  const headingDepth = options?.headingDepth ?? tree.headingDepth;
  let output = '';

  // 1. Output frontmatter (raw, for round-trip fidelity)
  if (tree.rawFrontmatter) {
    output += tree.rawFrontmatter;
  }

  // 2. Output root's own content (pre-heading content)
  if (tree.root.dirty) {
    if (tree.root.note) {
      output += tree.root.note + '\n\n';
    }
    for (const block of tree.root.blocks) {
      output += block.raw + '\n\n';
    }
  } else if (tree.root.rawText) {
    output += tree.root.rawText;
  }

  // 3. Recursively serialize children
  for (const child of tree.root.children) {
    output += serializeNode(child, headingDepth, 1);
  }

  return output;
}

/**
 * Serialize a single node and its subtree.
 */
function serializeNode(node: MindCtxNode, headingDepth: number, absoluteDepth: number): string {
  let output = '';

  // Fast path: node and entire subtree are clean — skip dirty checks entirely
  if (!node.dirty && !node.subtreeDirty) {
    output += node.rawText;
    for (const child of node.children) {
      output += collectRawText(child);
    }
    return output;
  }

  // Node's own content
  if (node.dirty) {
    output += generateNodeContent(node, headingDepth, absoluteDepth);
  } else {
    output += node.rawText;
  }

  // Recurse into children (subtreeDirty means at least one descendant is dirty)
  for (const child of node.children) {
    output += serializeNode(child, headingDepth, absoluteDepth + 1);
  }

  return output;
}

/**
 * Collect rawText from an entire clean subtree without checking dirty flags.
 * Used as an optimization when subtreeDirty === false.
 */
function collectRawText(node: MindCtxNode): string {
  let output = node.rawText;
  for (const child of node.children) {
    output += collectRawText(child);
  }
  return output;
}

function shouldSerializeAsHeading(node: MindCtxNode, absoluteDepth: number, headingDepth: number): boolean {
  return node.nodeType === 'heading' && absoluteDepth <= headingDepth;
}

function reindentRawBlock(raw: string, indent: string): string {
  const lines = raw.split('\n');
  const indentedLineLengths = lines
    .filter(line => line.trim().length > 0)
    .map(line => line.match(/^[ \t]*/)?.[0].length ?? 0);
  const commonIndent = indentedLineLengths.length > 0 ? Math.min(...indentedLineLengths) : 0;
  return lines
    .map(line => indent + (commonIndent > 0 ? line.slice(commonIndent) : line))
    .join('\n');
}

function getListIndentDepth(node: MindCtxNode, absoluteDepth: number, headingDepth: number): number {
  if (node.nodeType === 'list-item') {
    return Math.max(0, node.listDepth - 1);
  }
  return Math.max(0, absoluteDepth - headingDepth - 1);
}

/**
 * Regenerate node content from structured data when dirty.
 * This is used after operations modify the tree (rename, create, etc.).
 */
function generateNodeContent(node: MindCtxNode, headingDepth: number, absoluteDepth: number): string {
  let output = '';

  if (shouldSerializeAsHeading(node, absoluteDepth, headingDepth)) {
    // Output as heading
    output += '#'.repeat(absoluteDepth) + ' ' + node.title + '\n\n';
  } else {
    // Output as list-item
    const listDepth = getListIndentDepth(node, absoluteDepth, headingDepth);
    const indent = '  '.repeat(listDepth);
    if (node.checked !== null) {
      const check = node.checked ? '[x]' : '[ ]';
      output += indent + '- ' + check + ' ' + node.title + '\n';
    } else if (node.ordered) {
      output += indent + '1. ' + node.title + '\n';
    } else {
      output += indent + '- ' + node.title + '\n';
    }
  }

  // Output note
  if (node.note) {
    if (shouldSerializeAsHeading(node, absoluteDepth, headingDepth)) {
      output += node.note + '\n\n';
    } else {
      // List item note needs indentation
      const listDepth = getListIndentDepth(node, absoluteDepth, headingDepth);
      const noteIndent = '  '.repeat(listDepth + 1);
      const indentedNote = node.note.split('\n').map(line => noteIndent + line).join('\n');
      output += indentedNote + '\n\n';
    }
  }

  // Output blocks
  for (const block of node.blocks) {
    if (shouldSerializeAsHeading(node, absoluteDepth, headingDepth)) {
      output += block.raw + '\n\n';
    } else {
      const listDepth = getListIndentDepth(node, absoluteDepth, headingDepth);
      const blockIndent = '  '.repeat(listDepth + 1);
      output += reindentRawBlock(block.raw, blockIndent) + '\n\n';
    }
  }

  return output;
}

/**
 * Serialize a subtree as independent Markdown (for "copy as markdown" etc.).
 * This always regenerates from structured data regardless of dirty state.
 */
export function serializeSubtree(node: MindCtxNode, headingDepth: number, baseDepth = 1): string {
  let output = '';

  if (shouldSerializeAsHeading(node, baseDepth, headingDepth)) {
    output += '#'.repeat(baseDepth) + ' ' + node.title + '\n\n';
  } else {
    const listDepth = getListIndentDepth(node, baseDepth, headingDepth);
    const indent = '  '.repeat(listDepth);
    if (node.checked !== null) {
      const check = node.checked ? '[x]' : '[ ]';
      output += indent + '- ' + check + ' ' + node.title + '\n';
    } else if (node.ordered) {
      output += indent + '1. ' + node.title + '\n';
    } else {
      output += indent + '- ' + node.title + '\n';
    }
  }

  if (node.note) {
    if (shouldSerializeAsHeading(node, baseDepth, headingDepth)) {
      output += node.note + '\n\n';
    } else {
      const listDepth = getListIndentDepth(node, baseDepth, headingDepth);
      const noteIndent = '  '.repeat(listDepth + 1);
      const indentedNote = node.note.split('\n').map(line => noteIndent + line).join('\n');
      output += indentedNote + '\n\n';
    }
  }

  for (const block of node.blocks) {
    if (shouldSerializeAsHeading(node, baseDepth, headingDepth)) {
      output += block.raw + '\n\n';
    } else {
      const listDepth = getListIndentDepth(node, baseDepth, headingDepth);
      const blockIndent = '  '.repeat(listDepth + 1);
      output += reindentRawBlock(block.raw, blockIndent) + '\n\n';
    }
  }

  for (const child of node.children) {
    output += serializeSubtree(child, headingDepth, baseDepth + 1);
  }

  return output;
}
