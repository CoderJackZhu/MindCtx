# Phase 1：核心引擎 — Parser + Serializer + Operations

## 背景

MindDoc 是一个 Obsidian 插件，将标准 Markdown 文件解析为树形结构，提供大纲和思维导图两种视图。本阶段只做纯逻辑层，不涉及任何 UI，产出是一个可独立测试的 npm 包。

## 目标

实现以下核心模块，全部通过单元测试：

1. **Parser**：Markdown 文本 → MindDocTree（内部 AST）
2. **Serializer**：MindDocTree → Markdown 文本
3. **Operations**：对 AST 的所有原子编辑操作
4. **Undo/Redo**：操作历史管理

## 项目初始化

在 `/Users/zhuyijie/Documents/Code/MindDoc` 目录下创建以下结构：

```
package.json
tsconfig.json
vitest.config.ts
src/
  core/
    types.ts
    parser.ts
    serializer.ts
    operations.ts
    undo.ts
    hash.ts
tests/
  parser.test.ts
  serializer.test.ts
  operations.test.ts
  roundtrip.test.ts
  fixtures/
    simple.mind.md
    complex.mind.md
    heading-jump.mind.md
    list-only.mind.md
    empty.mind.md
    no-frontmatter.mind.md
```

### package.json 关键依赖

```json
{
  "name": "minddoc-core",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
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

### tsconfig.json

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

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

---

## 模块一：types.ts

定义所有核心数据结构。

```typescript
// src/core/types.ts

export interface ContentBlock {
  type: 'code' | 'blockquote' | 'image' | 'html' | 'hr' | 'table' | 'math';
  raw: string;
  language?: string;  // code block 语言标识
  alt?: string;       // image alt text
}

export interface SourceRange {
  startLine: number;  // 含，从 0 开始
  endLine: number;    // 不含
}

export interface MindDocNode {
  id: string;
  title: string;
  note: string;                    // 段落说明文本
  blocks: ContentBlock[];          // 附属内容块
  children: MindDocNode[];
  nodeType: 'heading' | 'list-item';
  headingLevel: number;            // 1-6 for heading, 0 for list-item
  listDepth: number;               // 0 for heading, 0+ for list-item (嵌套层级)
  checked: boolean | null;         // null=非任务, true/false=任务状态
  tags: string[];
  ordered: boolean;                // 是否来自有序列表（标题为 false）
  sourceRange: SourceRange;
  rawText: string;                 // 该节点自身的原始 Markdown 片段（不含子节点）
  dirty: boolean;                  // 是否被编辑（序列化时判断用 rawText 还是重新生成）
  subtreeDirty: boolean;           // 子树中是否有 dirty 节点（性能优化，可跳过子树递归检查）
}

export interface MindDocTree {
  version: 1;
  filePath: string;
  frontmatter: Record<string, any>;
  rawFrontmatter: string;          // 原始 frontmatter 文本（含 --- 分隔符和尾部换行），用于往返保真
  headingDepth: number;            // 标题最大深度，默认 3
  root: MindDocNode;               // 虚拟根节点
  metadata: {
    parseTime: number;
    nodeCount: number;
    maxDepth: number;
  };
}

// PartialOperation：调用者传入的操作意图（不含旧值）
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

// Operation：完整操作记录（含旧值，用于 undo/redo）
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
  defaultHeadingDepth?: number;  // 默认 3，仅当 frontmatter 中无 heading-depth 时使用
}

// 优先级：frontmatter['heading-depth'] > options.defaultHeadingDepth > 3

export interface SerializeOptions {
  headingDepth?: number;          // 覆盖 tree.headingDepth
}
```

---

## 模块二：hash.ts

节点 ID 生成工具。

```typescript
// src/core/hash.ts

// FNV-1a hash，生成稳定短字符串用作节点 ID
// 注意：标准 FNV-1a 64-bit 需要真正的 64-bit 整数运算。
// JavaScript Number 无法精确表示 64-bit 整数，以下实现使用 BigInt 确保正确性。
// 如果目标环境不支持 BigInt，可降级为两个 32-bit 半段分别处理（参考下方注释）。
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

// 生成节点 ID：基于从根到当前节点的路径
export function generateNodeId(titlePath: string[], siblingIndex: number): string {
  const pathStr = titlePath.join('/') + ':' + siblingIndex;
  return fnv1a64(pathStr);
}
```

---

## 模块三：parser.ts

### 核心职责

将 Markdown 文本解析为 `MindDocTree`。

### 解析规则（必须严格遵守）

1. **Frontmatter**：提取 YAML frontmatter，解析 `minddoc`, `version`, `default-view`, `heading-depth` 字段
2. **Heading → 节点**：`# title` 到 `###### title` 映射为深度 1-6 的 heading 节点
3. **List → 子节点**：无序/有序/任务列表的每一项都是一个 list-item 节点，嵌套缩进增加 listDepth。有序列表设 `ordered: true`，无序列表设 `ordered: false`
4. **段落 → note**：紧跟在标题或列表项后的段落文本归属为该节点的 note（包括列表项的后续段落）
5. **代码块/引用/表格/图片/HR/数学块 → blocks**：归属为当前节点的 blocks 数组
6. **标题跳级**：H1 后直接出现 H3，H3 作为 H1 的直接子节点（不插入虚拟 H2）
7. **多个 H1**：允许，作为虚拟根节点的平行子节点
8. **首标题前内容**：归属为虚拟根节点的 note/blocks
9. **虚拟根节点**：title 取文件名（不含扩展名）或 "Untitled"

**依赖插件说明：**
- `remark-frontmatter`：让 remark 识别 frontmatter 为 AST 节点
- `remark-gfm`：启用 GFM 扩展（任务列表的 `checked` 字段、表格、删除线等）
- `remark-math`：识别 `$$...$$` 和 `$...$` 数学块为 AST 节点（type: 'math'）
- 解析管线：`unified().use(remarkParse).use(remarkFrontmatter).use(remarkGfm).use(remarkMath).parse(markdown)`

**混合列表处理规则：**
- 同一父节点下可以同时出现有序列表和无序列表
- 每个 listItem 独立记录 `ordered` 属性（取自其所属 list 节点的 `ordered` 字段）
- 同一个 `list` AST 节点内的所有 `listItem` 共享相同的 `ordered` 值

### 解析算法

```
输入：Markdown 字符串 + ParseOptions
步骤：
  1. 使用 unified + remark-parse + remark-frontmatter 解析为 mdast
  2. 提取 frontmatter 节点，用 yaml 库解析；同时保存 frontmatter 的原始文本到 tree.rawFrontmatter（含 --- 分隔符和尾部换行）
  3. 创建虚拟根节点
  4. 用栈（stack）遍历 mdast 子节点：
     - heading 节点：
       a. 记录该 heading 的 startLine
       b. 弹出栈中 depth >= 当前 heading depth 的所有节点
       c. 创建 MindDocNode，push 到栈顶节点的 children
       d. 将新节点 push 入栈
     - list 节点：
       a. 递归处理每个 listItem
       b. listItem 的第一个 paragraph 子节点的文本 → title
       c. listItem 的后续 paragraph → note
       d. listItem 的嵌套 list → 递归为子节点
       e. 任务列表：checked 字段取自 listItem.checked
     - paragraph 节点：
       a. 如果栈顶节点的 note 为空，设为该段落文本
       b. 否则追加（\n\n 分隔）
     - code/blockquote/html/thematicBreak/table/image：
       a. 作为 ContentBlock 加入栈顶节点的 blocks
  5. 遍历完成后，回填每个节点的 sourceRange 和 rawText
  6. 生成节点 ID
  7. 计算 metadata
输出：MindDocTree
```

### sourceRange 和 rawText 回填逻辑

每个节点的 `rawText` **仅包含该节点自身的内容**（标题行/列表行 + note 段落 + blocks），**不包含子节点的文本**。需要在第一遍遍历完成后，按节点在原文中的出现顺序回填：

```
对于 heading 节点：
  startLine = heading 行的位置
  endLine = 第一个子节点的 startLine（或下一个同级/更高级标题的位置，或文件末尾）
  rawText = 从 startLine 到 endLine 之间的文本（即标题行 + 紧随的 note + blocks，不含子节点部分）

对于 list-item 节点：
  startLine = 列表项开始行
  endLine = 第一个子列表项的 startLine（或下一个同级列表项的 startLine，或列表结束）
  rawText = 从 startLine 到 endLine 之间的文本（即列表项行本身 + 后续段落，不含嵌套子项）
```

**关键点**：rawText 边界在"自身内容结束、子节点开始"处截断，不是在"下一个兄弟开始"处截断。这保证序列化时 `rawText + 递归子节点` 能正确拼出完整文本。

### 接口

```typescript
export function parse(markdown: string, options?: ParseOptions): MindDocTree;
```

---

## 模块四：serializer.ts

### 核心职责

将 `MindDocTree` 序列化回 Markdown 文本。

### 关键原则：往返保真

**rawText 范围**：仅包含该节点自身的内容（标题行/列表项行 + note + blocks），**不包含子节点的文本**。

**序列化规则**：
- 如果节点 `dirty === false`：使用 `rawText` 原样输出该节点自身内容
- 如果节点 `dirty === true`：从结构化数据（title/note/blocks）重新生成该节点自身内容
- 无论 dirty 状态如何，都必须递归序列化子节点
- `subtreeDirty` 仅作为性能优化提示：当 `subtreeDirty === false` 时，可以确定所有子节点也是 `dirty === false`，子节点可以直接使用各自的 rawText 而无需逐个检查

这保证了 `serialize(parse(text)) === text`（对未修改的文件）。

### 序列化规则

1. **Frontmatter**：优先使用 `tree.rawFrontmatter` 原样输出（实现往返保真）。仅当 frontmatter 被修改时（如修改了 `heading-depth`），才使用 yaml 库将 `tree.frontmatter` 序列化为 `---\n...\n---\n\n`。
2. **虚拟根节点的 note**：直接输出（首标题前内容）
3. **Heading 节点**：`#`.repeat(headingLevel) + ' ' + title + '\n\n'
4. **List-item 节点**：`'  '.repeat(listDepth)` + prefix + title + '\n'
   - prefix = `- ` 普通无序项，`1. ` 有序项，`- [x] ` 或 `- [ ] ` 任务项
5. **note**：紧跟标题/列表项后输出，后接 `\n\n`。列表项的 note 每行都需要加缩进（`'  '.repeat(listDepth + 1)`），否则多行 note 会脱离列表上下文。
6. **blocks**：逐个输出 `block.raw + '\n\n'`
7. **子节点**：递归序列化

### 类型转换规则

当节点被拖拽到新位置时，`dirty = true`，需要根据绝对深度决定输出为 heading 还是 list-item：

```
绝对深度 = 从虚拟根到当前节点的路径长度

if 绝对深度 <= tree.headingDepth:
  输出为 heading，headingLevel = 绝对深度
else:
  输出为 list-item，listDepth = 绝对深度 - tree.headingDepth - 1
```

### 接口

```typescript
export function serialize(tree: MindDocTree, options?: SerializeOptions): string;

// 序列化子树：将任意节点及其子树输出为独立的 Markdown 片段
// 用于"复制为 Markdown"等场景，baseDepth 控制输出的起始标题层级
export function serializeSubtree(node: MindDocNode, headingDepth: number, baseDepth?: number): string;
```

### serializeSubtree 实现逻辑

```typescript
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

---

## 模块五：operations.ts

### 核心职责

对 `MindDocTree` 执行原子编辑操作，返回操作记录（用于 undo）。

### 辅助函数（必须实现）

```typescript
// 在整棵树中查找节点
export function findNode(root: MindDocNode, id: string): MindDocNode | null;

// 查找节点的父节点
export function findParent(root: MindDocNode, id: string): MindDocNode | null;

// 查找节点在父节点 children 中的索引
export function findIndex(parent: MindDocNode, id: string): number;

// 计算节点的绝对深度（从虚拟根开始为 0）
export function getAbsoluteDepth(root: MindDocNode, id: string): number;

// 重新计算被移动节点及其子树的 nodeType/headingLevel/listDepth
export function recalculateNodeTypes(node: MindDocNode, absoluteDepth: number, headingDepth: number): void;
```

### 操作实现要求

每个操作必须：
1. 修改 AST（in-place）
2. 将涉及的节点标记为 `dirty = true`
3. **向上冒泡**：从被修改节点向上遍历所有祖先，将祖先的 `subtreeDirty` 设为 `true`
4. 调用 `recalculateNodeTypes` 更新移动后节点的类型信息
5. 返回完整的 `Operation` 对象（包含 undo 所需的旧值）

**index 约定**：`index: -1` 表示"追加到父节点的 children 末尾"，等价于 `parent.children.length`。`applyOperation` 内部需要将 -1 转换为实际索引。

### 各操作说明

| 操作 | 行为 |
|------|------|
| move | 将节点从旧位置移除，插入到新父节点的指定位置 |
| rename | 修改节点 title |
| create | 在指定父节点的指定位置创建新节点（默认值：`note: ''`, `blocks: []`, `checked: null`, `tags: []`, `ordered: false`, `dirty: true`） |
| delete | 删除节点（子节点一起删除） |
| indent | 节点变为其上一个兄弟的最后一个子节点 |
| outdent | 节点变为其父节点的下一个兄弟（原位置之后的兄弟变为该节点的子节点） |
| toggleCheck | null → false → true → null 循环。**约束**：对 heading 节点调用时，先将 nodeType 转为 'list-item'（headingLevel=0, listDepth 根据绝对深度计算），再执行 toggle |
| updateNote | 修改节点 note |
| moveUp | 在同级兄弟中向前移动一位 |
| moveDown | 在同级兄弟中向后移动一位 |

### 接口

```typescript
export function applyOperation(tree: MindDocTree, op: PartialOperation): Operation;
```

注意：输入的 op 是 `PartialOperation`（调用者不需要知道旧值），函数执行后返回完整的 `Operation`（含旧值，供 undo 使用）。对于 `create` 操作，调用者传入 `title: string`，函数内部创建完整的 `MindDocNode` 并返回在 `Operation.node` 中。

---

## 模块六：undo.ts

### 核心职责

管理操作历史栈，支持撤销和重做。

```typescript
export class UndoManager {
  private undoStack: Operation[][] = [];
  private redoStack: Operation[][] = [];
  private maxSize = 100;

  // 推入一组操作（一次用户行为可能产生多个原子操作）
  push(ops: Operation[]): void;

  // 撤销：弹出 undoStack 顶部，执行逆操作，推入 redoStack
  undo(tree: MindDocTree): Operation[] | null;

  // 重做：弹出 redoStack 顶部，执行正向操作，推入 undoStack
  redo(tree: MindDocTree): Operation[] | null;

  // 清空所有历史（外部文件修改时调用）
  clear(): void;

  // 查询状态
  canUndo(): boolean;
  canRedo(): boolean;
}
```

### 逆操作生成规则

```typescript
export function invertOperation(op: Operation): Operation[];
```

逆操作统一返回 `Operation[]`（数组），大部分操作返回单元素数组，`indent` 和 `outdent` 可能返回多个 `move` 操作。`UndoManager.undo` 按逆序执行数组中的每个操作。

| 操作 | 逆操作 |
|------|--------|
| move(node→newParent@idx) | [move(node→oldParent@oldIdx)] |
| rename(node, new) | [rename(node, old)] |
| create(parent, idx, node) | [delete(node.id, parent, idx, node)] |
| delete(id, parent, idx, node) | [create(parent, idx, node)] |
| indent(node, oldParentId, oldIdx) | [move(node→oldParent@oldIdx)]（使用 indent 记录的 oldParentId/oldIndex 直接移回） |
| outdent(node, oldParentId, oldIdx, adoptedSiblingIds) | [move(node→oldParent@oldIdx), move(adopted1→oldParent@oldIdx+1), move(adopted2→oldParent@oldIdx+2), ...] |
| toggleCheck(node) | [setCheck(node, oldValue)]（不是再次 toggle，而是直接恢复 oldValue） |
| updateNote(node, new) | [updateNote(node, old)] |
| moveUp(node) | [moveDown(node)] |
| moveDown(node) | [moveUp(node)] |

**indent 逆操作说明**：`indent` 将节点变为其上一个兄弟的最后一个子节点。其完整 Operation 记录 `oldParentId` 和 `oldIndex`，逆操作是一个 `move` 操作将节点移回原位。

**outdent 逆操作说明**：`outdent` 将节点提升为父节点的兄弟，同时将原位置之后的兄弟收为该节点的子节点（记录在 `adoptedSiblingIds` 中）。其逆操作不能简单用 `indent` 实现，而是需要：1) 将节点移回原父节点的原位置；2) 将被收走的兄弟从节点的 children 中移回原父节点。`invertOperation` 对 `outdent` 生成一组 `move` Operation。

---

## 测试要求

### tests/parser.test.ts

至少覆盖以下场景：

```typescript
describe('Parser', () => {
  test('解析简单标题结构');
  test('解析嵌套列表');
  test('解析混合标题+列表');
  test('段落归属为 note');
  test('代码块归属为 blocks');
  test('引用块归属为 blocks');
  test('标题跳级（H1→H3）');
  test('多个 H1 并列');
  test('首标题前有内容');
  test('空文件');
  test('纯列表无标题');
  test('任务列表解析 checked 状态');
  test('frontmatter 正确提取');
  test('无 frontmatter 使用默认值');
  test('heading-depth 正确读取');
  test('节点 sourceRange 正确');
  test('节点 ID 不重复');
  test('tags 从标题中提取 #tag');
});
```

### tests/serializer.test.ts

```typescript
describe('Serializer', () => {
  test('基本标题序列化');
  test('列表序列化');
  test('混合结构序列化');
  test('note 正确输出');
  test('blocks 正确输出');
  test('任务列表正确输出');
  test('frontmatter 正确输出');
  test('dirty 节点重新序列化');
  test('非 dirty 节点使用 rawText');
  test('heading-depth 控制类型转换');
  test('深层节点自动转为 list-item');
});
```

### tests/roundtrip.test.ts

```typescript
describe('Round-trip fidelity', () => {
  test('simple.mind.md 往返一致');
  test('complex.mind.md 往返一致');
  test('heading-jump.mind.md 往返一致');
  test('list-only.mind.md 往返一致');
  test('no-frontmatter.mind.md 往返一致');
  // 最关键的测试：
  test('所有 fixtures 文件往返一致', () => {
    const fixturesDir = new URL('./fixtures', import.meta.url).pathname;
    const files = readdirSync(fixturesDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const text = readFileSync(join(fixturesDir, file), 'utf-8');
      const tree = parse(text);
      expect(serialize(tree)).toBe(text);
    }
  });
});
```

### tests/operations.test.ts

```typescript
describe('Operations', () => {
  test('move 节点到新父节点');
  test('move 节点改变顺序');
  test('rename 节点');
  test('create 新节点');
  test('delete 节点');
  test('indent 节点');
  test('outdent 节点');
  test('indent 边界：第一个兄弟不能 indent');
  test('outdent 边界：根的子节点不能 outdent');
  test('moveUp/moveDown');
  test('toggleCheck 循环');
  test('操作后节点 dirty=true');
  test('操作后 recalculateNodeTypes 正确');
  test('undo 恢复原始状态');
  test('redo 恢复操作后状态');
  test('连续多次 undo');
  test('undo 后新操作清空 redo 栈');
  test('undo move 操作恢复原位置');
  test('undo create 操作删除节点');
  test('undo delete 操作恢复节点');
  test('undo rename 操作恢复原标题');
  test('undo toggleCheck 恢复 oldValue（非循环）');
  test('undo outdent 恢复被收走的兄弟节点');
  test('undo 栈超过 100 步时淘汰最老操作');
  test('连续 undo 到栈空不 crash');
});```

---

## 测试 Fixture 文件内容

### tests/fixtures/simple.mind.md

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

### tests/fixtures/complex.mind.md

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

### tests/fixtures/heading-jump.mind.md

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

### tests/fixtures/list-only.mind.md

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

### tests/fixtures/empty.mind.md

```markdown
---
minddoc: true
---
```

### tests/fixtures/no-frontmatter.mind.md

```markdown
# 没有 frontmatter 的文件

## 子节点 A

## 子节点 B

- 列表项
```

---

## 验收标准

1. `npm install` 成功
2. `npm test` 全部通过（0 failures）
3. 所有 fixture 文件的往返测试通过
4. 标题跳级、多 H1、空文件等边界情况全部有测试覆盖
5. Operations 的 undo/redo 测试全部通过（每种操作类型至少一个 undo 测试）
6. TypeScript 无编译错误（`npx tsc --noEmit`）
7. 5000 行 Markdown 文件解析时间 < 500ms（在 Node.js 中测量）

---

## 注意事项

- 不要安装任何 UI 相关依赖
- 不要创建任何视图/组件代码
- 所有代码必须是纯逻辑，可在 Node.js 中运行
- rawText 回填是往返保真的关键，不能跳过
- frontmatter 必须原样保留所有字段（包括未知字段）
- 解析大文件时不要一次性拼接完整字符串到内存，按行切片即可
