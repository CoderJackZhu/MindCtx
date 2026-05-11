# Phase 1: Core Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure-logic npm package (no UI) that parses Markdown into a tree AST, serializes it back with round-trip fidelity, and supports atomic edit operations with undo/redo.

**Architecture:** Parser uses unified/remark to convert Markdown to mdast, then walks the mdast to build a MindDocTree. Serializer outputs rawText for unmodified nodes, regenerates from structured data for dirty nodes. Operations mutate the tree in-place, marking dirty flags, and return Operation records for undo. UndoManager maintains a 100-step stack of operation groups.

**Tech Stack:** TypeScript (strict, ES2022), Vitest, unified + remark-parse + remark-frontmatter + remark-gfm + remark-math, yaml

**Key Decisions:**
1. rawText includes trailing blank lines, computed by line slicing from original text
2. No parent pointers — use traversal (tree is small, operations infrequent)
3. Node IDs generated only at parse time, stable during edit session

---

## File Structure

```
/Users/zhuyijie/Documents/Code/MindDoc/
├── package.json              — Project metadata + dependencies
├── tsconfig.json             — TypeScript strict config
├── vitest.config.ts          — Test runner config
├── src/
│   └── core/
│       ├── types.ts          — All type definitions (interfaces + type unions)
│       ├── hash.ts           — FNV-1a 64-bit hash + node ID generation
│       ├── parser.ts         — Markdown text → MindDocTree
│       ├── serializer.ts     — MindDocTree → Markdown text (round-trip fidelity)
│       ├── operations.ts     — Atomic tree operations (move, rename, create, delete, indent, outdent, etc.)
│       └── undo.ts           — UndoManager class + invertOperation
└── tests/
    ├── parser.test.ts        — Parser unit tests
    ├── serializer.test.ts    — Serializer unit tests
    ├── operations.test.ts    — Operations + undo/redo tests
    ├── roundtrip.test.ts     — Round-trip fidelity tests across all fixtures
    └── fixtures/
        ├── simple.mind.md
        ├── complex.mind.md
        ├── heading-jump.mind.md
        ├── list-only.mind.md
        ├── empty.mind.md
        └── no-frontmatter.mind.md
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "minddoc-core",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4",
    "vitest": "^2.0",
    "@types/node": "^20"
  },
  "dependencies": {
    "unified": "^11",
    "remark-parse": "^11",
    "remark-frontmatter": "^5",
    "remark-gfm": "^4",
    "remark-math": "^6",
    "yaml": "^2"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: Clean install, `node_modules/` created, no errors.

- [ ] **Step 5: Verify setup**

Run: `npx tsc --noEmit`
Expected: No errors (no source files yet, should pass cleanly)

- [ ] **Step 6: Commit**

```bash
git init
git add package.json tsconfig.json vitest.config.ts package-lock.json
git commit -m "chore: initialize project with TypeScript + Vitest"
```

---

### Task 2: Type Definitions + Hash Utilities

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/hash.ts`
- Create: `tests/hash.test.ts`

- [ ] **Step 1: Create src/core/types.ts**

```typescript
export interface ContentBlock {
  type: 'code' | 'blockquote' | 'image' | 'html' | 'hr' | 'table' | 'math';
  raw: string;
  language?: string;
  alt?: string;
}

export interface SourceRange {
  startLine: number;
  endLine: number;
}

export interface MindDocNode {
  id: string;
  title: string;
  note: string;
  blocks: ContentBlock[];
  children: MindDocNode[];
  nodeType: 'heading' | 'list-item';
  headingLevel: number;
  listDepth: number;
  checked: boolean | null;
  tags: string[];
  ordered: boolean;
  sourceRange: SourceRange;
  rawText: string;
  dirty: boolean;
  subtreeDirty: boolean;
}

export interface MindDocTree {
  version: 1;
  filePath: string;
  frontmatter: Record<string, any>;
  rawFrontmatter: string;
  headingDepth: number;
  root: MindDocNode;
  metadata: {
    parseTime: number;
    nodeCount: number;
    maxDepth: number;
  };
}

export type PartialOperation =
  | { type: 'move'; nodeId: string; newParentId: string; index: number }
  | { type: 'rename'; nodeId: string; newTitle: string }
  | { type: 'create'; parentId: string; index: number; title: string }
  | { type: 'delete'; nodeId: string }
  | { type: 'indent'; nodeId: string }
  | { type: 'outdent'; nodeId: string }
  | { type: 'toggleCheck'; nodeId: string }
  | { type: 'updateNote'; nodeId: string; note: string }
  | { type: 'moveUp'; nodeId: string }
  | { type: 'moveDown'; nodeId: string };

export type Operation =
  | { type: 'move'; nodeId: string; newParentId: string; index: number; oldParentId: string; oldIndex: number }
  | { type: 'rename'; nodeId: string; newTitle: string; oldTitle: string }
  | { type: 'create'; parentId: string; index: number; node: MindDocNode }
  | { type: 'delete'; nodeId: string; parentId: string; index: number; deletedNode: MindDocNode }
  | { type: 'indent'; nodeId: string; oldParentId: string; oldIndex: number }
  | { type: 'outdent'; nodeId: string; oldParentId: string; oldIndex: number; adoptedSiblingIds: string[] }
  | { type: 'toggleCheck'; nodeId: string; oldValue: boolean | null }
  | { type: 'updateNote'; nodeId: string; note: string; oldNote: string }
  | { type: 'moveUp'; nodeId: string }
  | { type: 'moveDown'; nodeId: string };

export interface ParseOptions {
  filePath?: string;
  defaultHeadingDepth?: number;
}

export interface SerializeOptions {
  headingDepth?: number;
}
```

- [ ] **Step 2: Create src/core/hash.ts**

```typescript
export function fnv1a64(str: string): string {
  const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK_64 = (1n << 64n) - 1n;

  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(36);
}

export function generateNodeId(titlePath: string[], siblingIndex: number): string {
  const pathStr = titlePath.join('/') + ':' + siblingIndex;
  return fnv1a64(pathStr);
}
```

- [ ] **Step 3: Write hash tests**

Create `tests/hash.test.ts`:

```typescript
import { describe, test, expect } from 'vitest';
import { fnv1a64, generateNodeId } from '../src/core/hash.js';

describe('hash', () => {
  test('fnv1a64 returns consistent results', () => {
    const h1 = fnv1a64('hello');
    const h2 = fnv1a64('hello');
    expect(h1).toBe(h2);
  });

  test('fnv1a64 different inputs produce different outputs', () => {
    const h1 = fnv1a64('hello');
    const h2 = fnv1a64('world');
    expect(h1).not.toBe(h2);
  });

  test('fnv1a64 returns base36 string', () => {
    const h = fnv1a64('test');
    expect(h).toMatch(/^[0-9a-z]+$/);
  });

  test('generateNodeId uses path and index', () => {
    const id1 = generateNodeId(['root', 'child'], 0);
    const id2 = generateNodeId(['root', 'child'], 1);
    expect(id1).not.toBe(id2);
  });

  test('generateNodeId different paths produce different IDs', () => {
    const id1 = generateNodeId(['root', 'child1'], 0);
    const id2 = generateNodeId(['root', 'child2'], 0);
    expect(id1).not.toBe(id2);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/hash.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/hash.ts tests/hash.test.ts
git commit -m "feat: add core type definitions and hash utilities"
```

---

### Task 3: Test Fixture Files

**Files:**
- Create: `tests/fixtures/simple.mind.md`
- Create: `tests/fixtures/complex.mind.md`
- Create: `tests/fixtures/heading-jump.mind.md`
- Create: `tests/fixtures/list-only.mind.md`
- Create: `tests/fixtures/empty.mind.md`
- Create: `tests/fixtures/no-frontmatter.mind.md`

- [ ] **Step 1: Create tests/fixtures/simple.mind.md**

```markdown
---
minddoc: true
---

# 项目规划

## 需求分析

- 用户调研
- 竞品分析

## 技术方案

- 前端
- 后端
```

- [ ] **Step 2: Create tests/fixtures/complex.mind.md**

```markdown
---
minddoc: true
version: 1
default-view: outline
heading-depth: 3
---

# Agent 工程能力体系

Agent 工程能力体系主要包括工具调用、规划、记忆、RAG、评估和工程化部署。

## 一、工具调用

工具调用是 Agent 从"文本生成器"变成"任务执行器"的关键。

### Function Calling

- 参数 schema
- 参数校验
  - 类型检查
  - 范围检查
- 调用失败重试
- 工具结果归一化

### MCP

> MCP 是模型上下文协议，由 Anthropic 提出。

- MCP Server
- MCP Client
- Tools
- Resources
- Prompts

## 二、规划能力

### ReAct

- Thought
- Action
- Observation

### Plan-and-Execute

- Planner
- Executor
- Verifier

## 三、RAG

### 检索

- BM25
- Embedding
- Hybrid Search

### 重排

- Cross Encoder
- LLM Rerank

## 四、评估

- [ ] 自动评估流水线
- [x] 人工评估标准
- [ ] A/B 测试框架
```

- [ ] **Step 3: Create tests/fixtures/heading-jump.mind.md**

```markdown
---
minddoc: true
---

# 根节点

### 跳级到三级

内容说明。

##### 跳级到五级

## 回到二级

- 列表项A
- 列表项B
```

- [ ] **Step 4: Create tests/fixtures/list-only.mind.md**

```markdown
---
minddoc: true
---

- 没有标题的文档
  - 子项 A
  - 子项 B
    - 孙项 B1
- 第二个顶级项
```

- [ ] **Step 5: Create tests/fixtures/empty.mind.md**

```markdown
---
minddoc: true
---
```

- [ ] **Step 6: Create tests/fixtures/no-frontmatter.mind.md**

```markdown
# 没有 frontmatter 的文件

## 子节点 A

## 子节点 B

- 列表项
```

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures/
git commit -m "feat: add test fixture files for parser/serializer"
```

---

### Task 4: Parser Implementation

**Files:**
- Create: `src/core/parser.ts`

This is the most complex module. It uses unified/remark to parse Markdown into mdast, then walks the mdast to build a MindDocTree. Key challenges: list handling, rawText backfill, source range computation.

- [ ] **Step 1: Create the parser module with imports and helpers**

```typescript
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { parse as parseYaml } from 'yaml';
import type { Root, Content, Heading, List, ListItem, Paragraph, Code, Blockquote, ThematicBreak, Table, Image, Html, Math as MdastMath } from 'mdast';
import type { MindDocNode, MindDocTree, ContentBlock, ParseOptions } from './types.js';
import { generateNodeId } from './hash.js';

function createNode(partial: Partial<MindDocNode> & { title: string }): MindDocNode {
  return {
    id: '',
    title: partial.title,
    note: partial.note ?? '',
    blocks: partial.blocks ?? [],
    children: partial.children ?? [],
    nodeType: partial.nodeType ?? 'heading',
    headingLevel: partial.headingLevel ?? 0,
    listDepth: partial.listDepth ?? 0,
    checked: partial.checked ?? null,
    tags: partial.tags ?? [],
    ordered: partial.ordered ?? false,
    sourceRange: partial.sourceRange ?? { startLine: 0, endLine: 0 },
    rawText: partial.rawText ?? '',
    dirty: false,
    subtreeDirty: false,
  };
}

function extractInlineText(node: any): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'inlineCode') return '`' + node.value + '`';
  if (node.type === 'strong') return '**' + (node.children?.map(extractInlineText).join('') ?? '') + '**';
  if (node.type === 'emphasis') return '*' + (node.children?.map(extractInlineText).join('') ?? '') + '*';
  if (node.type === 'delete') return '~~' + (node.children?.map(extractInlineText).join('') ?? '') + '~~';
  if (node.type === 'link') return '[' + (node.children?.map(extractInlineText).join('') ?? '') + '](' + node.url + ')';
  if (node.type === 'image') return '![' + (node.alt ?? '') + '](' + node.url + ')';
  if (node.type === 'inlineMath') return '$' + node.value + '$';
  if (node.children) return node.children.map(extractInlineText).join('');
  return node.value ?? '';
}

function extractTags(title: string): string[] {
  const tagRegex = /#([^\s#]+)/g;
  const tags: string[] = [];
  let match;
  while ((match = tagRegex.exec(title)) !== null) {
    tags.push(match[1]);
  }
  return tags;
}

function paragraphToText(node: Paragraph): string {
  return node.children.map(extractInlineText).join('');
}
```

- [ ] **Step 2: Implement the main parse function structure**

Continue in `src/core/parser.ts`:

```typescript
export function parse(markdown: string, options?: ParseOptions): MindDocTree {
  const startTime = performance.now();
  const lines = markdown.split('\n');

  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMath);

  const mdast = processor.parse(markdown) as Root;

  // Extract frontmatter
  let frontmatter: Record<string, any> = {};
  let rawFrontmatter = '';
  const fmNode = mdast.children.find(n => n.type === 'yaml');
  if (fmNode && fmNode.type === 'yaml') {
    const fmValue = (fmNode as any).value as string;
    frontmatter = parseYaml(fmValue) ?? {};
    const fmStart = fmNode.position!.start.line - 1;
    const fmEnd = fmNode.position!.end.line;
    rawFrontmatter = lines.slice(fmStart, fmEnd).join('\n') + '\n';
    // Include trailing blank line if present
    if (fmEnd < lines.length && lines[fmEnd] === '') {
      rawFrontmatter += '\n';
    }
  }

  // Determine headingDepth
  const headingDepth: number = frontmatter['heading-depth']
    ?? options?.defaultHeadingDepth
    ?? 3;

  // Determine file path
  const filePath = options?.filePath ?? '';
  const fileName = filePath ? filePath.replace(/.*\//, '').replace(/\.[^.]+$/, '') : 'Untitled';

  // Create virtual root
  const root = createNode({
    title: fileName,
    nodeType: 'heading',
    headingLevel: 0,
  });

  // Walk mdast and build tree
  buildTree(mdast, root, lines);

  // Backfill rawText and sourceRange
  backfillRawText(root, lines, rawFrontmatter ? (fmNode!.position!.end.line + (lines[fmNode!.position!.end.line] === '' ? 1 : 0)) : 0, lines.length);

  // Generate IDs
  assignIds(root, []);

  // Compute metadata
  const nodeCount = countNodes(root);
  const maxDepth = computeMaxDepth(root, 0);
  const parseTime = performance.now() - startTime;

  return {
    version: 1,
    filePath,
    frontmatter,
    rawFrontmatter,
    headingDepth,
    root,
    metadata: { parseTime, nodeCount, maxDepth },
  };
}
```

- [ ] **Step 3: Implement buildTree — heading and content block handling**

```typescript
function buildTree(mdast: Root, root: MindDocNode, lines: string[]): void {
  // Stack tracks the current hierarchy: [root, h1, h2, ...]
  const stack: MindDocNode[] = [root];

  for (const child of mdast.children) {
    if (child.type === 'yaml') continue; // Already handled

    if (child.type === 'heading') {
      const heading = child as Heading;
      const depth = heading.depth;
      const title = heading.children.map(extractInlineText).join('');
      const tags = extractTags(title);
      const startLine = heading.position!.start.line - 1;

      // Pop stack until we find a node with lower depth
      while (stack.length > 1) {
        const top = stack[stack.length - 1];
        if (top.nodeType === 'heading' && top.headingLevel >= depth) {
          stack.pop();
        } else if (top.nodeType === 'list-item') {
          stack.pop();
        } else {
          break;
        }
      }

      const node = createNode({
        title,
        nodeType: 'heading',
        headingLevel: depth,
        tags,
        sourceRange: { startLine, endLine: startLine + 1 },
      });

      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (child.type === 'list') {
      const currentParent = stack[stack.length - 1];
      processListNode(child as List, currentParent, 0, lines);
    } else if (child.type === 'paragraph') {
      const currentNode = stack[stack.length - 1];
      const text = paragraphToText(child as Paragraph);
      if (currentNode.note === '') {
        currentNode.note = text;
      } else {
        currentNode.note += '\n\n' + text;
      }
    } else if (child.type === 'code') {
      const code = child as Code;
      const startLine = code.position!.start.line - 1;
      const endLine = code.position!.end.line;
      const raw = lines.slice(startLine, endLine).join('\n');
      stack[stack.length - 1].blocks.push({
        type: 'code',
        raw,
        language: code.lang ?? undefined,
      });
    } else if (child.type === 'blockquote') {
      const startLine = child.position!.start.line - 1;
      const endLine = child.position!.end.line;
      const raw = lines.slice(startLine, endLine).join('\n');
      stack[stack.length - 1].blocks.push({ type: 'blockquote', raw });
    } else if (child.type === 'thematicBreak') {
      const startLine = child.position!.start.line - 1;
      const endLine = child.position!.end.line;
      const raw = lines.slice(startLine, endLine).join('\n');
      stack[stack.length - 1].blocks.push({ type: 'hr', raw });
    } else if (child.type === 'table') {
      const startLine = child.position!.start.line - 1;
      const endLine = child.position!.end.line;
      const raw = lines.slice(startLine, endLine).join('\n');
      stack[stack.length - 1].blocks.push({ type: 'table', raw });
    } else if (child.type === 'html') {
      const startLine = child.position!.start.line - 1;
      const endLine = child.position!.end.line;
      const raw = lines.slice(startLine, endLine).join('\n');
      stack[stack.length - 1].blocks.push({ type: 'html', raw });
    } else if (child.type === 'math') {
      const startLine = child.position!.start.line - 1;
      const endLine = child.position!.end.line;
      const raw = lines.slice(startLine, endLine).join('\n');
      stack[stack.length - 1].blocks.push({ type: 'math', raw });
    }
  }
}
```

- [ ] **Step 4: Implement processListNode for recursive list handling**

```typescript
function processListNode(list: List, parent: MindDocNode, baseDepth: number, lines: string[]): void {
  const isOrdered = list.ordered ?? false;

  for (const item of list.children) {
    if (item.type !== 'listItem') continue;
    const listItem = item as ListItem;
    const startLine = listItem.position!.start.line - 1;

    let title = '';
    let note = '';
    const blocks: ContentBlock[] = [];
    const children: MindDocNode[] = [];

    for (const itemChild of listItem.children) {
      if (itemChild.type === 'paragraph') {
        const text = paragraphToText(itemChild as Paragraph);
        if (title === '') {
          title = text;
        } else if (note === '') {
          note = text;
        } else {
          note += '\n\n' + text;
        }
      } else if (itemChild.type === 'list') {
        // Nested list — will be processed after creating the node
      } else if (itemChild.type === 'code') {
        const code = itemChild as Code;
        const sl = code.position!.start.line - 1;
        const el = code.position!.end.line;
        blocks.push({ type: 'code', raw: lines.slice(sl, el).join('\n'), language: code.lang ?? undefined });
      } else if (itemChild.type === 'blockquote') {
        const sl = itemChild.position!.start.line - 1;
        const el = itemChild.position!.end.line;
        blocks.push({ type: 'blockquote', raw: lines.slice(sl, el).join('\n') });
      } else if (itemChild.type === 'table') {
        const sl = itemChild.position!.start.line - 1;
        const el = itemChild.position!.end.line;
        blocks.push({ type: 'table', raw: lines.slice(sl, el).join('\n') });
      }
    }

    const tags = extractTags(title);
    const node = createNode({
      title,
      note,
      blocks,
      nodeType: 'list-item',
      headingLevel: 0,
      listDepth: baseDepth,
      checked: listItem.checked ?? null,
      tags,
      ordered: isOrdered,
      sourceRange: { startLine, endLine: listItem.position!.end.line },
    });

    parent.children.push(node);

    // Process nested lists as children of this node
    for (const itemChild of listItem.children) {
      if (itemChild.type === 'list') {
        processListNode(itemChild as List, node, baseDepth + 1, lines);
      }
    }
  }
}
```

- [ ] **Step 5: Implement rawText backfill logic**

```typescript
function backfillRawText(root: MindDocNode, lines: string[], contentStart: number, totalLines: number): void {
  // Collect all nodes in document order with their start lines
  const allNodes: { node: MindDocNode; startLine: number }[] = [];
  collectNodesInOrder(root, allNodes);

  // Sort by startLine to establish document order
  allNodes.sort((a, b) => a.startLine - b.startLine);

  for (let i = 0; i < allNodes.length; i++) {
    const { node, startLine } = allNodes[i];
    const nodeStart = startLine;

    // Find where this node's own content ends:
    // It's the start of its first child (if any), or the start of the next sibling/uncle
    let ownContentEnd: number;

    if (node.children.length > 0) {
      // First child's start line
      ownContentEnd = getFirstDescendantStartLine(node.children[0]);
    } else {
      // Find next node in document order
      ownContentEnd = findNextNodeStart(allNodes, i, totalLines);
    }

    node.sourceRange = { startLine: nodeStart, endLine: ownContentEnd };
    node.rawText = lines.slice(nodeStart, ownContentEnd).join('\n');
    if (ownContentEnd < totalLines) {
      node.rawText += '\n';
    }
  }

  // Virtual root: content before first child
  if (root.children.length > 0) {
    const firstChildStart = allNodes.length > 0 ? allNodes[0].startLine : totalLines;
    root.sourceRange = { startLine: contentStart, endLine: firstChildStart };
    root.rawText = lines.slice(contentStart, firstChildStart).join('\n');
    if (firstChildStart < totalLines && root.rawText.length > 0) {
      root.rawText += '\n';
    }
  } else {
    root.sourceRange = { startLine: contentStart, endLine: totalLines };
    root.rawText = lines.slice(contentStart, totalLines).join('\n');
    if (root.rawText.length > 0 && !root.rawText.endsWith('\n')) {
      root.rawText += '\n';
    }
  }
}

function collectNodesInOrder(node: MindDocNode, result: { node: MindDocNode; startLine: number }[]): void {
  for (const child of node.children) {
    result.push({ node: child, startLine: child.sourceRange.startLine });
    collectNodesInOrder(child, result);
  }
}

function getFirstDescendantStartLine(node: MindDocNode): number {
  return node.sourceRange.startLine;
}

function findNextNodeStart(allNodes: { node: MindDocNode; startLine: number }[], currentIdx: number, totalLines: number): number {
  if (currentIdx + 1 < allNodes.length) {
    return allNodes[currentIdx + 1].startLine;
  }
  return totalLines;
}
```

- [ ] **Step 6: Implement ID assignment and metadata helpers**

```typescript
function assignIds(node: MindDocNode, parentPath: string[]): void {
  const siblingCounts = new Map<string, number>();

  for (const child of node.children) {
    const key = child.title;
    const count = siblingCounts.get(key) ?? 0;
    siblingCounts.set(key, count + 1);

    const path = [...parentPath, child.title];
    child.id = generateNodeId(path, count);
    assignIds(child, path);
  }
}

function countNodes(node: MindDocNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}

function computeMaxDepth(node: MindDocNode, currentDepth: number): number {
  let max = currentDepth;
  for (const child of node.children) {
    max = Math.max(max, computeMaxDepth(child, currentDepth + 1));
  }
  return max;
}
```

- [ ] **Step 7: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/core/parser.ts
git commit -m "feat: implement Markdown parser with mdast walking and rawText backfill"
```

---

### Task 5: Parser Tests

**Files:**
- Create: `tests/parser.test.ts`

- [ ] **Step 1: Write parser tests**

```typescript
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parse } from '../src/core/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('Parser', () => {
  test('解析简单标题结构', () => {
    const tree = parse(fixture('simple.mind.md'));
    expect(tree.root.children.length).toBe(1); // One H1
    const h1 = tree.root.children[0];
    expect(h1.title).toBe('项目规划');
    expect(h1.nodeType).toBe('heading');
    expect(h1.headingLevel).toBe(1);
    expect(h1.children.length).toBe(2); // Two H2s
    expect(h1.children[0].title).toBe('需求分析');
    expect(h1.children[1].title).toBe('技术方案');
  });

  test('解析嵌套列表', () => {
    const tree = parse(fixture('complex.mind.md'));
    const functionCalling = tree.root.children[0].children[0].children[0]; // H1 > H2 > H3
    expect(functionCalling.title).toBe('Function Calling');
    const paramValidation = functionCalling.children[1]; // 参数校验
    expect(paramValidation.title).toBe('参数校验');
    expect(paramValidation.children.length).toBe(2); // 类型检查, 范围检查
    expect(paramValidation.children[0].title).toBe('类型检查');
    expect(paramValidation.children[1].title).toBe('范围检查');
  });

  test('解析混合标题+列表', () => {
    const tree = parse(fixture('simple.mind.md'));
    const h2 = tree.root.children[0].children[0]; // 需求分析
    expect(h2.children.length).toBe(2);
    expect(h2.children[0].nodeType).toBe('list-item');
    expect(h2.children[0].title).toBe('用户调研');
  });

  test('段落归属为 note', () => {
    const tree = parse(fixture('complex.mind.md'));
    const h1 = tree.root.children[0];
    expect(h1.note).toContain('Agent 工程能力体系主要包括');
  });

  test('代码块归属为 blocks', () => {
    const md = '# Test\n\n```js\nconsole.log("hi")\n```\n';
    const tree = parse(md);
    expect(tree.root.children[0].blocks.length).toBe(1);
    expect(tree.root.children[0].blocks[0].type).toBe('code');
    expect(tree.root.children[0].blocks[0].language).toBe('js');
  });

  test('引用块归属为 blocks', () => {
    const tree = parse(fixture('complex.mind.md'));
    const mcp = tree.root.children[0].children[0].children[1]; // MCP
    expect(mcp.blocks.length).toBe(1);
    expect(mcp.blocks[0].type).toBe('blockquote');
  });

  test('标题跳级（H1→H3）', () => {
    const tree = parse(fixture('heading-jump.mind.md'));
    const h1 = tree.root.children[0];
    expect(h1.title).toBe('根节点');
    // H3 is direct child of H1 (no virtual H2)
    expect(h1.children[0].title).toBe('跳级到三级');
    expect(h1.children[0].headingLevel).toBe(3);
  });

  test('多个 H1 并列', () => {
    const md = '# First\n\n# Second\n\n# Third\n';
    const tree = parse(md);
    expect(tree.root.children.length).toBe(3);
    expect(tree.root.children[0].title).toBe('First');
    expect(tree.root.children[1].title).toBe('Second');
    expect(tree.root.children[2].title).toBe('Third');
  });

  test('首标题前有内容', () => {
    const md = 'Some intro text.\n\n# Main\n\nContent.\n';
    const tree = parse(md);
    expect(tree.root.note).toBe('Some intro text.');
    expect(tree.root.children[0].title).toBe('Main');
  });

  test('空文件', () => {
    const tree = parse(fixture('empty.mind.md'));
    expect(tree.root.children.length).toBe(0);
  });

  test('纯列表无标题', () => {
    const tree = parse(fixture('list-only.mind.md'));
    expect(tree.root.children.length).toBe(2);
    expect(tree.root.children[0].title).toBe('没有标题的文档');
    expect(tree.root.children[0].nodeType).toBe('list-item');
    expect(tree.root.children[0].children.length).toBe(2); // 子项 A, 子项 B
  });

  test('任务列表解析 checked 状态', () => {
    const tree = parse(fixture('complex.mind.md'));
    const evaluation = tree.root.children[0].children[3]; // 四、评估
    expect(evaluation.children[0].checked).toBe(false); // [ ] 自动评估
    expect(evaluation.children[1].checked).toBe(true);  // [x] 人工评估
    expect(evaluation.children[2].checked).toBe(false); // [ ] A/B 测试
  });

  test('frontmatter 正确提取', () => {
    const tree = parse(fixture('complex.mind.md'));
    expect(tree.frontmatter['minddoc']).toBe(true);
    expect(tree.frontmatter['version']).toBe(1);
    expect(tree.frontmatter['default-view']).toBe('outline');
    expect(tree.frontmatter['heading-depth']).toBe(3);
  });

  test('无 frontmatter 使用默认值', () => {
    const tree = parse(fixture('no-frontmatter.mind.md'));
    expect(tree.frontmatter).toEqual({});
    expect(tree.headingDepth).toBe(3);
  });

  test('heading-depth 正确读取', () => {
    const tree = parse(fixture('complex.mind.md'));
    expect(tree.headingDepth).toBe(3);
  });

  test('节点 ID 不重复', () => {
    const tree = parse(fixture('complex.mind.md'));
    const ids = new Set<string>();
    function collectIds(node: any) {
      if (node.id) {
        expect(ids.has(node.id)).toBe(false);
        ids.add(node.id);
      }
      for (const child of node.children) {
        collectIds(child);
      }
    }
    collectIds(tree.root);
    expect(ids.size).toBeGreaterThan(0);
  });

  test('tags 从标题中提取 #tag', () => {
    const md = '# Project #important #urgent\n';
    const tree = parse(md);
    expect(tree.root.children[0].tags).toContain('important');
    expect(tree.root.children[0].tags).toContain('urgent');
  });

  test('有序列表设 ordered: true', () => {
    const md = '# Test\n\n1. First\n2. Second\n';
    const tree = parse(md);
    expect(tree.root.children[0].children[0].ordered).toBe(true);
    expect(tree.root.children[0].children[1].ordered).toBe(true);
  });

  test('nodeCount 统计正确', () => {
    const tree = parse(fixture('simple.mind.md'));
    // root(1) + H1(1) + 2 H2s(2) + 4 list items(4) = 8
    expect(tree.metadata.nodeCount).toBe(8);
  });
});
```

- [ ] **Step 2: Run parser tests**

Run: `npx vitest run tests/parser.test.ts`
Expected: All tests pass. If any fail, debug and fix the parser.

- [ ] **Step 3: Commit**

```bash
git add tests/parser.test.ts
git commit -m "test: add comprehensive parser tests"
```

---

### Task 6: Serializer Implementation

**Files:**
- Create: `src/core/serializer.ts`

- [ ] **Step 1: Implement the serializer**

```typescript
import type { MindDocNode, MindDocTree, SerializeOptions } from './types.js';

export function serialize(tree: MindDocTree, options?: SerializeOptions): string {
  const headingDepth = options?.headingDepth ?? tree.headingDepth;
  let output = '';

  // Output frontmatter
  if (tree.rawFrontmatter) {
    output += tree.rawFrontmatter;
  }

  // Output root's own content (pre-heading content)
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

  // Recursively serialize children
  for (const child of tree.root.children) {
    output += serializeNode(child, headingDepth, 1);
  }

  return output;
}

function serializeNode(node: MindDocNode, headingDepth: number, absoluteDepth: number): string {
  let output = '';

  if (!node.dirty && !node.subtreeDirty) {
    // Fast path: node and all descendants are clean — output rawText + children rawTexts
    output += node.rawText;
    for (const child of node.children) {
      output += serializeNodeRaw(child);
    }
    return output;
  }

  if (node.dirty) {
    // Regenerate this node's own content from structured data
    output += generateNodeContent(node, headingDepth, absoluteDepth);
  } else {
    // Node itself is clean, use rawText
    output += node.rawText;
  }

  // Recurse into children
  for (const child of node.children) {
    output += serializeNode(child, headingDepth, absoluteDepth + 1);
  }

  return output;
}

function serializeNodeRaw(node: MindDocNode): string {
  let output = node.rawText;
  for (const child of node.children) {
    output += serializeNodeRaw(child);
  }
  return output;
}

function generateNodeContent(node: MindDocNode, headingDepth: number, absoluteDepth: number): string {
  let output = '';

  if (absoluteDepth <= headingDepth) {
    // Output as heading
    output += '#'.repeat(absoluteDepth) + ' ' + node.title + '\n\n';
  } else {
    // Output as list-item
    const listDepth = absoluteDepth - headingDepth - 1;
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
    if (absoluteDepth <= headingDepth) {
      output += node.note + '\n\n';
    } else {
      // List item note needs indentation
      const listDepth = absoluteDepth - headingDepth - 1;
      const noteIndent = '  '.repeat(listDepth + 1);
      const indentedNote = node.note.split('\n').map(line => noteIndent + line).join('\n');
      output += indentedNote + '\n\n';
    }
  }

  // Output blocks
  for (const block of node.blocks) {
    if (absoluteDepth <= headingDepth) {
      output += block.raw + '\n\n';
    } else {
      const listDepth = absoluteDepth - headingDepth - 1;
      const blockIndent = '  '.repeat(listDepth + 1);
      const indentedBlock = block.raw.split('\n').map(line => blockIndent + line).join('\n');
      output += indentedBlock + '\n\n';
    }
  }

  return output;
}

export function serializeSubtree(node: MindDocNode, headingDepth: number, baseDepth = 1): string {
  let output = '';

  if (baseDepth <= headingDepth) {
    output += '#'.repeat(baseDepth) + ' ' + node.title + '\n\n';
  } else {
    const indent = '  '.repeat(baseDepth - headingDepth - 1);
    output += indent + '- ' + node.title + '\n';
  }

  if (node.note) {
    output += node.note + '\n\n';
  }

  for (const block of node.blocks) {
    output += block.raw + '\n\n';
  }

  for (const child of node.children) {
    output += serializeSubtree(child, headingDepth, baseDepth + 1);
  }

  return output;
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/serializer.ts
git commit -m "feat: implement serializer with round-trip fidelity support"
```

---

### Task 7: Serializer Tests + Round-trip Tests

**Files:**
- Create: `tests/serializer.test.ts`
- Create: `tests/roundtrip.test.ts`

- [ ] **Step 1: Write serializer tests**

```typescript
import { describe, test, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { serialize, serializeSubtree } from '../src/core/serializer.js';

describe('Serializer', () => {
  test('基本标题序列化', () => {
    const md = '# Title\n\n## Sub\n\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('列表序列化', () => {
    const md = '# Title\n\n- Item 1\n- Item 2\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('混合结构序列化', () => {
    const md = '# Title\n\n## Sub\n\n- Item\n  - Nested\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('note 正确输出', () => {
    const md = '# Title\n\nSome note text.\n\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('blocks 正确输出', () => {
    const md = '# Title\n\n```js\ncode\n```\n\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('任务列表正确输出', () => {
    const md = '# Title\n\n- [ ] Todo\n- [x] Done\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('frontmatter 正确输出', () => {
    const md = '---\nminddoc: true\n---\n\n# Title\n\n';
    const tree = parse(md);
    expect(serialize(tree)).toBe(md);
  });

  test('dirty 节点重新序列化', () => {
    const md = '# Old Title\n\n';
    const tree = parse(md);
    tree.root.children[0].title = 'New Title';
    tree.root.children[0].dirty = true;
    const result = serialize(tree);
    expect(result).toContain('# New Title');
    expect(result).not.toContain('# Old Title');
  });

  test('非 dirty 节点使用 rawText', () => {
    const md = '# Title\n\n## Sub\n\n';
    const tree = parse(md);
    // Don't mark dirty — should use rawText
    expect(serialize(tree)).toBe(md);
  });

  test('serializeSubtree 基本功能', () => {
    const md = '# Root\n\n## Child\n\n- Item\n';
    const tree = parse(md);
    const child = tree.root.children[0].children[0]; // "Child" H2
    const result = serializeSubtree(child, 3, 1);
    expect(result).toContain('# Child');
  });
});
```

- [ ] **Step 2: Write roundtrip tests**

```typescript
import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parse } from '../src/core/parser.js';
import { serialize } from '../src/core/serializer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

describe('Round-trip fidelity', () => {
  test('simple.mind.md 往返一致', () => {
    const text = readFileSync(join(fixturesDir, 'simple.mind.md'), 'utf-8');
    const tree = parse(text);
    expect(serialize(tree)).toBe(text);
  });

  test('complex.mind.md 往返一致', () => {
    const text = readFileSync(join(fixturesDir, 'complex.mind.md'), 'utf-8');
    const tree = parse(text);
    expect(serialize(tree)).toBe(text);
  });

  test('heading-jump.mind.md 往返一致', () => {
    const text = readFileSync(join(fixturesDir, 'heading-jump.mind.md'), 'utf-8');
    const tree = parse(text);
    expect(serialize(tree)).toBe(text);
  });

  test('list-only.mind.md 往返一致', () => {
    const text = readFileSync(join(fixturesDir, 'list-only.mind.md'), 'utf-8');
    const tree = parse(text);
    expect(serialize(tree)).toBe(text);
  });

  test('no-frontmatter.mind.md 往返一致', () => {
    const text = readFileSync(join(fixturesDir, 'no-frontmatter.mind.md'), 'utf-8');
    const tree = parse(text);
    expect(serialize(tree)).toBe(text);
  });

  test('所有 fixtures 文件往返一致', () => {
    const files = readdirSync(fixturesDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const text = readFileSync(join(fixturesDir, file), 'utf-8');
      const tree = parse(text);
      expect(serialize(tree), `Round-trip failed for ${file}`).toBe(text);
    }
  });
});
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All parser, serializer, roundtrip, and hash tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/serializer.test.ts tests/roundtrip.test.ts
git commit -m "test: add serializer and round-trip fidelity tests"
```

---

### Task 8: Operations Implementation

**Files:**
- Create: `src/core/operations.ts`

- [ ] **Step 1: Implement helper functions**

```typescript
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

function markDirty(root: MindDocNode, nodeId: string): void {
  const node = findNode(root, nodeId);
  if (node) node.dirty = true;
  bubbleSubtreeDirty(root, nodeId);
}

function bubbleSubtreeDirty(root: MindDocNode, nodeId: string): void {
  // Walk from root to the node, marking subtreeDirty on each ancestor
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
```

- [ ] **Step 2: Implement applyOperation with move, rename, create, delete**

```typescript
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

      // Adopt remaining siblings after this node's position
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

      // Cycle: null → false → true → null
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

function extractTagsFromTitle(title: string): string[] {
  const tagRegex = /#([^\s#]+)/g;
  const tags: string[] = [];
  let match;
  while ((match = tagRegex.exec(title)) !== null) {
    tags.push(match[1]);
  }
  return tags;
}
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/operations.ts
git commit -m "feat: implement all tree operations (move, rename, create, delete, indent, outdent, toggleCheck, updateNote, moveUp, moveDown)"
```

---

### Task 9: Undo Manager Implementation

**Files:**
- Create: `src/core/undo.ts`

- [ ] **Step 1: Implement invertOperation**

```typescript
import type { MindDocTree, MindDocNode, Operation } from './types.js';
import { applyOperation } from './operations.js';

export function invertOperation(op: Operation): Operation[] {
  switch (op.type) {
    case 'move':
      return [{ type: 'move', nodeId: op.nodeId, newParentId: op.oldParentId, index: op.oldIndex, oldParentId: op.newParentId, oldIndex: op.index }];

    case 'rename':
      return [{ type: 'rename', nodeId: op.nodeId, newTitle: op.oldTitle, oldTitle: op.newTitle }];

    case 'create':
      return [{ type: 'delete', nodeId: op.node.id, parentId: op.parentId, index: op.index, deletedNode: op.node }];

    case 'delete':
      return [{ type: 'create', parentId: op.parentId, index: op.index, node: op.deletedNode }];

    case 'indent':
      return [{ type: 'move', nodeId: op.nodeId, newParentId: op.oldParentId, index: op.oldIndex, oldParentId: '', oldIndex: -1 }];

    case 'outdent': {
      // Move node back to old parent at old index
      const ops: Operation[] = [
        { type: 'move', nodeId: op.nodeId, newParentId: op.oldParentId, index: op.oldIndex, oldParentId: '', oldIndex: -1 },
      ];
      // Move adopted siblings back to old parent, after the node
      for (let i = 0; i < op.adoptedSiblingIds.length; i++) {
        ops.push({
          type: 'move',
          nodeId: op.adoptedSiblingIds[i],
          newParentId: op.oldParentId,
          index: op.oldIndex + 1 + i,
          oldParentId: op.nodeId,
          oldIndex: -1,
        });
      }
      return ops;
    }

    case 'toggleCheck':
      return [{ type: 'toggleCheck', nodeId: op.nodeId, oldValue: op.oldValue }];

    case 'updateNote':
      return [{ type: 'updateNote', nodeId: op.nodeId, note: op.oldNote, oldNote: op.note }];

    case 'moveUp':
      return [{ type: 'moveDown', nodeId: op.nodeId }];

    case 'moveDown':
      return [{ type: 'moveUp', nodeId: op.nodeId }];
  }
}
```

- [ ] **Step 2: Implement UndoManager class**

```typescript
import { findNode, findParent, findIndex, getAbsoluteDepth, recalculateNodeTypes } from './operations.js';

export class UndoManager {
  private undoStack: Operation[][] = [];
  private redoStack: Operation[][] = [];
  private maxSize = 100;

  push(ops: Operation[]): void {
    this.undoStack.push(ops);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(tree: MindDocTree): Operation[] | null {
    const ops = this.undoStack.pop();
    if (!ops) return null;

    const invertedOps: Operation[] = [];
    // Process in reverse order
    for (let i = ops.length - 1; i >= 0; i--) {
      const inverted = invertOperation(ops[i]);
      for (const inv of inverted) {
        const result = executeOperation(tree, inv);
        invertedOps.push(result);
      }
    }

    this.redoStack.push(ops);
    return invertedOps;
  }

  redo(tree: MindDocTree): Operation[] | null {
    const ops = this.redoStack.pop();
    if (!ops) return null;

    const results: Operation[] = [];
    for (const op of ops) {
      const result = executeOperation(tree, op);
      results.push(result);
    }

    this.undoStack.push(ops);
    return results;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

function executeOperation(tree: MindDocTree, op: Operation): Operation {
  const root = tree.root;

  switch (op.type) {
    case 'move': {
      const node = findNode(root, op.nodeId)!;
      const currentParent = findParent(root, op.nodeId)!;
      const currentIndex = findIndex(currentParent, op.nodeId);
      currentParent.children.splice(currentIndex, 1);

      const newParent = findNode(root, op.newParentId)!;
      const insertIdx = op.index === -1 ? newParent.children.length : op.index;
      newParent.children.splice(insertIdx, 0, node);

      node.dirty = true;
      const depth = getAbsoluteDepth(root, op.nodeId);
      recalculateNodeTypes(node, depth, tree.headingDepth);
      return { ...op, oldParentId: currentParent.id, oldIndex: currentIndex };
    }

    case 'rename': {
      const node = findNode(root, op.nodeId)!;
      const oldTitle = node.title;
      node.title = op.newTitle;
      node.dirty = true;
      return { ...op, oldTitle };
    }

    case 'create': {
      const parent = findNode(root, op.parentId)!;
      const insertIdx = op.index === -1 ? parent.children.length : op.index;
      parent.children.splice(insertIdx, 0, op.node);
      op.node.dirty = true;
      return op;
    }

    case 'delete': {
      const parent = findNode(root, op.parentId)!;
      const index = findIndex(parent, op.nodeId);
      const deletedNode = parent.children.splice(index, 1)[0];
      return { ...op, deletedNode };
    }

    case 'toggleCheck': {
      const node = findNode(root, op.nodeId)!;
      const currentValue = node.checked;
      node.checked = op.oldValue;
      node.dirty = true;
      return { type: 'toggleCheck', nodeId: op.nodeId, oldValue: currentValue };
    }

    case 'updateNote': {
      const node = findNode(root, op.nodeId)!;
      const currentNote = node.note;
      node.note = op.note;
      node.dirty = true;
      return { type: 'updateNote', nodeId: op.nodeId, note: op.note, oldNote: currentNote };
    }

    case 'moveUp': {
      const parent = findParent(root, op.nodeId)!;
      const index = findIndex(parent, op.nodeId);
      if (index > 0) {
        [parent.children[index - 1], parent.children[index]] = [parent.children[index], parent.children[index - 1]];
      }
      return op;
    }

    case 'moveDown': {
      const parent = findParent(root, op.nodeId)!;
      const index = findIndex(parent, op.nodeId);
      if (index < parent.children.length - 1) {
        [parent.children[index], parent.children[index + 1]] = [parent.children[index + 1], parent.children[index]];
      }
      return op;
    }

    case 'indent':
    case 'outdent':
      // These should not appear directly in undo/redo — they're converted to move operations
      throw new Error(`Unexpected operation type in executeOperation: ${op.type}`);
  }
}
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/undo.ts
git commit -m "feat: implement UndoManager with invertOperation and 100-step history"
```

---

### Task 10: Operations + Undo Tests

**Files:**
- Create: `tests/operations.test.ts`

- [ ] **Step 1: Write operations tests**

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import { parse } from '../src/core/parser.js';
import { serialize } from '../src/core/serializer.js';
import { applyOperation, findNode, findParent, findIndex } from '../src/core/operations.js';
import { UndoManager } from '../src/core/undo.js';
import type { MindDocTree } from '../src/core/types.js';

const simpleMd = `---
minddoc: true
---

# Root

## Child A

- Item 1
- Item 2
- Item 3

## Child B

- Item B1
`;

function makeTree(): MindDocTree {
  return parse(simpleMd);
}

describe('Operations', () => {
  let tree: MindDocTree;

  beforeEach(() => {
    tree = makeTree();
  });

  test('move 节点到新父节点', () => {
    const item1 = tree.root.children[0].children[1].children[0]; // Item 1
    const childB = tree.root.children[0].children[1]; // Child B — wait, let me check structure
    // Root > H1(Root) > H2(Child A), H2(Child B)
    // Child A has: Item 1, Item 2, Item 3
    const childA = tree.root.children[0].children[0];
    const childB2 = tree.root.children[0].children[1];
    const item1Id = childA.children[0].id;
    const childBId = childB2.id;

    const op = applyOperation(tree, { type: 'move', nodeId: item1Id, newParentId: childBId, index: -1 });
    expect(childA.children.length).toBe(2);
    expect(childB2.children[childB2.children.length - 1].id).toBe(item1Id);
    expect(op.type).toBe('move');
  });

  test('rename 节点', () => {
    const childA = tree.root.children[0].children[0];
    const op = applyOperation(tree, { type: 'rename', nodeId: childA.id, newTitle: 'Renamed' });
    expect(childA.title).toBe('Renamed');
    expect(op.type === 'rename' && op.oldTitle).toBe('Child A');
  });

  test('create 新节点', () => {
    const childA = tree.root.children[0].children[0];
    const op = applyOperation(tree, { type: 'create', parentId: childA.id, index: 0, title: 'New Item' });
    expect(childA.children[0].title).toBe('New Item');
    expect(childA.children[0].dirty).toBe(true);
    expect(op.type === 'create' && op.node.title).toBe('New Item');
  });

  test('delete 节点', () => {
    const childA = tree.root.children[0].children[0];
    const item1Id = childA.children[0].id;
    const originalLength = childA.children.length;
    const op = applyOperation(tree, { type: 'delete', nodeId: item1Id });
    expect(childA.children.length).toBe(originalLength - 1);
    expect(op.type === 'delete' && op.deletedNode.id).toBe(item1Id);
  });

  test('indent 节点', () => {
    const childA = tree.root.children[0].children[0];
    const item2Id = childA.children[1].id; // Item 2
    const item1 = childA.children[0]; // Item 1 (prev sibling)
    const op = applyOperation(tree, { type: 'indent', nodeId: item2Id });
    // Item 2 should now be last child of Item 1
    expect(item1.children[item1.children.length - 1].id).toBe(item2Id);
    expect(childA.children.length).toBe(2); // Item 1, Item 3
  });

  test('indent 边界：第一个兄弟不能 indent', () => {
    const childA = tree.root.children[0].children[0];
    const item1Id = childA.children[0].id;
    expect(() => applyOperation(tree, { type: 'indent', nodeId: item1Id })).toThrow();
  });

  test('outdent 节点', () => {
    // First indent Item 2 under Item 1, then outdent it back
    const childA = tree.root.children[0].children[0];
    const item2Id = childA.children[1].id;
    applyOperation(tree, { type: 'indent', nodeId: item2Id });
    // Now Item 2 is child of Item 1, outdent it
    const op = applyOperation(tree, { type: 'outdent', nodeId: item2Id });
    // Item 2 should be back as sibling of Item 1
    expect(findParent(tree.root, item2Id)!.id).toBe(childA.id);
  });

  test('outdent 边界：根的子节点不能 outdent', () => {
    const h1 = tree.root.children[0];
    expect(() => applyOperation(tree, { type: 'outdent', nodeId: h1.id })).toThrow();
  });

  test('moveUp/moveDown', () => {
    const childA = tree.root.children[0].children[0];
    const item2Id = childA.children[1].id;
    const item1Id = childA.children[0].id;

    applyOperation(tree, { type: 'moveUp', nodeId: item2Id });
    expect(childA.children[0].id).toBe(item2Id);
    expect(childA.children[1].id).toBe(item1Id);

    applyOperation(tree, { type: 'moveDown', nodeId: item2Id });
    expect(childA.children[0].id).toBe(item1Id);
    expect(childA.children[1].id).toBe(item2Id);
  });

  test('toggleCheck 循环', () => {
    const childA = tree.root.children[0].children[0];
    const item1 = childA.children[0];
    expect(item1.checked).toBeNull();

    applyOperation(tree, { type: 'toggleCheck', nodeId: item1.id });
    expect(item1.checked).toBe(false);

    applyOperation(tree, { type: 'toggleCheck', nodeId: item1.id });
    expect(item1.checked).toBe(true);

    applyOperation(tree, { type: 'toggleCheck', nodeId: item1.id });
    expect(item1.checked).toBeNull();
  });

  test('操作后节点 dirty=true', () => {
    const childA = tree.root.children[0].children[0];
    expect(childA.dirty).toBe(false);
    applyOperation(tree, { type: 'rename', nodeId: childA.id, newTitle: 'New' });
    expect(childA.dirty).toBe(true);
  });

  test('操作后 recalculateNodeTypes 正确', () => {
    // Move a heading's child list-item to become a child of root (should become heading)
    const childA = tree.root.children[0].children[0];
    const item1 = childA.children[0];
    const item1Id = item1.id;
    expect(item1.nodeType).toBe('list-item');

    // Move to be direct child of H1 (depth 2 = still heading if headingDepth >= 2)
    const h1 = tree.root.children[0];
    applyOperation(tree, { type: 'move', nodeId: item1Id, newParentId: h1.id, index: 0 });
    // Now item1 is at depth 2 (root=0, h1=1, item1=2), headingDepth=3, so nodeType=heading
    expect(item1.nodeType).toBe('heading');
    expect(item1.headingLevel).toBe(2);
  });
});

describe('Undo/Redo', () => {
  let tree: MindDocTree;
  let undoManager: UndoManager;

  beforeEach(() => {
    tree = makeTree();
    undoManager = new UndoManager();
  });

  test('undo rename 操作恢复原标题', () => {
    const childA = tree.root.children[0].children[0];
    const op = applyOperation(tree, { type: 'rename', nodeId: childA.id, newTitle: 'Renamed' });
    undoManager.push([op]);
    expect(childA.title).toBe('Renamed');

    undoManager.undo(tree);
    expect(childA.title).toBe('Child A');
  });

  test('redo 恢复操作后状态', () => {
    const childA = tree.root.children[0].children[0];
    const op = applyOperation(tree, { type: 'rename', nodeId: childA.id, newTitle: 'Renamed' });
    undoManager.push([op]);
    undoManager.undo(tree);
    expect(childA.title).toBe('Child A');

    undoManager.redo(tree);
    expect(childA.title).toBe('Renamed');
  });

  test('undo create 操作删除节点', () => {
    const childA = tree.root.children[0].children[0];
    const op = applyOperation(tree, { type: 'create', parentId: childA.id, index: 0, title: 'New' });
    undoManager.push([op]);
    expect(childA.children[0].title).toBe('New');

    undoManager.undo(tree);
    expect(childA.children[0].title).not.toBe('New');
  });

  test('undo delete 操作恢复节点', () => {
    const childA = tree.root.children[0].children[0];
    const item1Id = childA.children[0].id;
    const item1Title = childA.children[0].title;
    const op = applyOperation(tree, { type: 'delete', nodeId: item1Id });
    undoManager.push([op]);

    undoManager.undo(tree);
    expect(childA.children[0].id).toBe(item1Id);
    expect(childA.children[0].title).toBe(item1Title);
  });

  test('undo move 操作恢复原位置', () => {
    const childA = tree.root.children[0].children[0];
    const childB = tree.root.children[0].children[1];
    const item1Id = childA.children[0].id;
    const originalChildALen = childA.children.length;

    const op = applyOperation(tree, { type: 'move', nodeId: item1Id, newParentId: childB.id, index: -1 });
    undoManager.push([op]);

    undoManager.undo(tree);
    expect(childA.children.length).toBe(originalChildALen);
    expect(childA.children[0].id).toBe(item1Id);
  });

  test('undo toggleCheck 恢复 oldValue（非循环）', () => {
    const childA = tree.root.children[0].children[0];
    const item1 = childA.children[0];
    expect(item1.checked).toBeNull();

    const op = applyOperation(tree, { type: 'toggleCheck', nodeId: item1.id });
    undoManager.push([op]);
    expect(item1.checked).toBe(false);

    undoManager.undo(tree);
    expect(item1.checked).toBeNull(); // Restored to null, not cycled
  });

  test('undo outdent 恢复被收走的兄弟节点', () => {
    const childA = tree.root.children[0].children[0];
    // Indent Item 2 under Item 1 first
    const item2Id = childA.children[1].id;
    const item3Id = childA.children[2].id;
    applyOperation(tree, { type: 'indent', nodeId: item2Id });
    applyOperation(tree, { type: 'indent', nodeId: item3Id });
    // Now Item 1 has children: [Item 2, Item 3]
    const item1 = childA.children[0];
    expect(item1.children.length).toBe(2);

    // Outdent Item 2 — it should adopt Item 3
    const op = applyOperation(tree, { type: 'outdent', nodeId: item2Id });
    undoManager.push([op]);

    // Item 2 is now sibling of Item 1, with Item 3 as child
    const item2 = findNode(tree.root, item2Id)!;
    expect(item2.children.some(c => c.id === item3Id)).toBe(true);

    // Undo: Item 2 goes back under Item 1, Item 3 also goes back
    undoManager.undo(tree);
    expect(item1.children.some(c => c.id === item2Id)).toBe(true);
    expect(item1.children.some(c => c.id === item3Id)).toBe(true);
  });

  test('连续多次 undo', () => {
    const childA = tree.root.children[0].children[0];
    const op1 = applyOperation(tree, { type: 'rename', nodeId: childA.id, newTitle: 'A1' });
    undoManager.push([op1]);
    const op2 = applyOperation(tree, { type: 'rename', nodeId: childA.id, newTitle: 'A2' });
    undoManager.push([op2]);
    const op3 = applyOperation(tree, { type: 'rename', nodeId: childA.id, newTitle: 'A3' });
    undoManager.push([op3]);

    undoManager.undo(tree);
    expect(childA.title).toBe('A2');
    undoManager.undo(tree);
    expect(childA.title).toBe('A1');
    undoManager.undo(tree);
    expect(childA.title).toBe('Child A');
  });

  test('undo 后新操作清空 redo 栈', () => {
    const childA = tree.root.children[0].children[0];
    const op1 = applyOperation(tree, { type: 'rename', nodeId: childA.id, newTitle: 'New' });
    undoManager.push([op1]);
    undoManager.undo(tree);
    expect(undoManager.canRedo()).toBe(true);

    const op2 = applyOperation(tree, { type: 'rename', nodeId: childA.id, newTitle: 'Other' });
    undoManager.push([op2]);
    expect(undoManager.canRedo()).toBe(false);
  });

  test('undo 栈超过 100 步时淘汰最老操作', () => {
    const childA = tree.root.children[0].children[0];
    for (let i = 0; i < 105; i++) {
      const op = applyOperation(tree, { type: 'rename', nodeId: childA.id, newTitle: `Title ${i}` });
      undoManager.push([op]);
    }
    // Should only be able to undo 100 times
    let count = 0;
    while (undoManager.canUndo()) {
      undoManager.undo(tree);
      count++;
    }
    expect(count).toBe(100);
  });

  test('连续 undo 到栈空不 crash', () => {
    expect(undoManager.undo(tree)).toBeNull();
    expect(undoManager.undo(tree)).toBeNull();
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (hash, parser, serializer, roundtrip, operations).

- [ ] **Step 3: Commit**

```bash
git add tests/operations.test.ts
git commit -m "test: add comprehensive operations and undo/redo tests"
```

---

### Task 11: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 2: Run complete test suite**

Run: `npx vitest run`
Expected: All tests pass, 0 failures.

- [ ] **Step 3: Performance sanity check**

Create and run a quick performance test inline:

```bash
node --loader ts-node/esm -e "
import { parse } from './src/core/parser.js';
const bigMd = '---\nminddoc: true\n---\n\n' + Array.from({length: 500}, (_, i) => '# H' + i + '\n\n' + Array.from({length: 5}, (_, j) => '- item ' + j + '\n').join('') + '\n').join('');
const start = performance.now();
parse(bigMd);
console.log('Parse time:', (performance.now() - start).toFixed(1) + 'ms');
"
```

Expected: Parse time < 500ms.

- [ ] **Step 4: Final commit (if any fixes were needed)**

```bash
git status
# If clean, no commit needed. If fixes were made:
git add -A
git commit -m "fix: address issues found during final verification"
```

---

## Acceptance Criteria Checklist

- [ ] `npm install` succeeds
- [ ] `npm test` all pass (0 failures)
- [ ] All fixture files pass round-trip tests
- [ ] Heading jumps, multi-H1, empty file edge cases covered
- [ ] Operations undo/redo tests all pass (each operation type has undo test)
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] 5000-line Markdown parsing < 500ms
