# @mindctx/core

MindCtx 的共享核心引擎 —— 纯逻辑层，不依赖任何 UI 框架或编辑器平台。

## 安装

```bash
pnpm add @mindctx/core
```

## 功能

- **解析器**：将 Markdown 解析为 MindCtxTree 结构
- **序列化器**：将 MindCtxTree 序列化回 Markdown（往返保真）
- **操作引擎**：move / rename / create / delete / indent / outdent / toggleCheck / updateNote
- **撤销系统**：基于操作逆向的完整 undo/redo
- **导入器**：OPML、FreeMind (.mm)
- **导出器**：OPML、JSON
- **AI 上下文**：结构化文本输出，适合 LLM 使用
- **Mind Elixir Bridge**（`@mindctx/core/bridge` 子路径）：数据转换 + 事件绑定

## 用法

```typescript
import { parse, serialize, applyOperation, findNode } from '@mindctx/core';

// 解析 Markdown
const tree = parse(markdown, { filePath: 'example.mind.md' });

// 查找节点
const node = findNode(tree.root, nodeId);

// 应用操作
const fullOp = applyOperation(tree, { type: 'rename', nodeId, newTitle: 'New Title' });

// 序列化回 Markdown
const output = serialize(tree);
```

## 导出路径

| 路径 | 说明 |
|------|------|
| `@mindctx/core` | 主入口：parser、serializer、operations、undo、importers、exporters、AI |
| `@mindctx/core/bridge` | Mind Elixir 集成（浏览器环境专用，包含 mind-elixir 依赖） |

## API 概览

### 解析/序列化

| 函数 | 签名 |
|------|------|
| `parse` | `(markdown: string, options?: ParseOptions) => MindCtxTree` |
| `serialize` | `(tree: MindCtxTree, options?: SerializeOptions) => string` |
| `serializeSubtree` | `(node: MindCtxNode, tree: MindCtxTree) => string` |

### 操作

| 函数 | 签名 |
|------|------|
| `applyOperation` | `(tree: MindCtxTree, op: PartialOperation \| Operation) => Operation` |
| `findNode` | `(root: MindCtxNode, id: string) => MindCtxNode \| null` |
| `findParent` | `(root: MindCtxNode, id: string) => MindCtxNode \| null` |
| `invertOperation` | `(op: Operation) => Operation[]` |

### 导入/导出

| 函数 | 签名 |
|------|------|
| `importOPML` | `(xml: string, fileName?: string) => string` |
| `importFreeMind` | `(xml: string, fileName?: string) => string` |
| `exportOPML` | `(tree: MindCtxTree) => string` |
| `exportJSON` | `(tree: MindCtxTree) => string` |
| `copyAsAIContext` | `(tree: MindCtxTree) => string` |

### Bridge（`@mindctx/core/bridge`）

| 函数 | 说明 |
|------|------|
| `treeToMindElixirData` | 将 MindCtxTree 转换为 Mind Elixir 数据格式 |
| `setupMindElixirEvents` | 绑定 Mind Elixir 事件到操作回调 |
| `syncMindElixirAddChildButtons` | 同步 "+" 按钮状态 |
| `getMindElixirDirection` | 将设置方向转为 Mind Elixir direction 枚举 |

## 测试

```bash
pnpm test        # 125 个测试
pnpm test:watch  # 监听模式
```

## 许可证

MIT
