# VSCode MindCtx Extension Design Spec

## Overview

将 MindCtx Obsidian 插件的功能移植到 VSCode 平台，采用 Monorepo 结构共享核心逻辑，通过 Custom Editor API 提供与 Obsidian 版一致的双视图编辑体验。

## Architecture

### Monorepo 结构

```
mindctx/
├── packages/
│   ├── core/                ← 纯逻辑层（无平台依赖）
│   │   ├── src/
│   │   │   ├── parser.ts
│   │   │   ├── serializer.ts
│   │   │   ├── operations.ts
│   │   │   ├── undo.ts          ← 仅提供 invertOperation，不维护 stack
│   │   │   ├── hash.ts
│   │   │   ├── types.ts
│   │   │   ├── importers/
│   │   │   │   ├── opml.ts
│   │   │   │   └── freemind.ts
│   │   │   ├── exporters/
│   │   │   │   ├── opml.ts
│   │   │   │   └── json.ts
│   │   │   ├── bridge/
│   │   │   │   └── mindElixirBridge.ts  ← MindCtxTree ↔ MindElixir 数据转换
│   │   │   ├── ai/
│   │   │   │   └── contextBuilder.ts    ← AI 上下文生成
│   │   │   └── utils/
│   │   │       └── debounce.ts
│   │   ├── package.json     ← name: @mindctx/core
│   │   └── tsconfig.json
│   ├── obsidian/            ← 现有 Obsidian 插件
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── views/
│   │   │   ├── settings/
│   │   │   ├── state.ts     ← Obsidian vault 状态持久化
│   │   │   └── utils/
│   │   ├── manifest.json    ← 保持在包根目录（发布需要）
│   │   ├── styles.css
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── vscode/              ← 新 VSCode 扩展
│       ├── src/
│       │   ├── extension.ts             ← 扩展入口
│       │   ├── MindCtxEditorProvider.ts  ← Custom Editor Provider
│       │   ├── MindCtxDocument.ts       ← CustomDocument + edit tracking
│       │   ├── commands/                ← VSCode 命令注册
│       │   ├── state.ts                 ← workspaceState 持久化
│       │   ├── webview/                 ← Webview 内的 Preact 应用
│       │   │   ├── index.tsx
│       │   │   ├── App.tsx
│       │   │   ├── WebviewBridge.ts     ← 通信抽象层（核心适配）
│       │   │   ├── OutlineView.tsx
│       │   │   ├── MindMapView.tsx
│       │   │   ├── components/
│       │   │   └── bridge/
│       │   └── types/
│       │       └── messages.ts          ← 通信协议类型定义
│       ├── media/                       ← 静态资源（图标等）
│       ├── package.json                 ← VSCode extension manifest
│       └── tsconfig.json
├── tests/                   ← 共享测试（core 测试）
├── package.json             ← workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### 包管理

使用 pnpm workspace。`@mindctx/core` 作为内部依赖被 obsidian 和 vscode 包引用。

### 构建工具

- core: tsup（输出 ESM + CJS）
- obsidian: esbuild（保持现有构建，输出 main.js 到 packages/obsidian/ 根目录）
- vscode extension host: esbuild（bundle extension.ts）
- vscode webview: esbuild（bundle webview/index.tsx，输出单文件）

## Custom Editor 实现

### 核心类

**MindCtxEditorProvider** (implements `CustomEditorProvider<MindCtxDocument>`)

职责：
- 注册为 `.mind.md` 文件的默认编辑器（package.json 中 `customEditors` 配置 `priority: "default"`）
- 通过 `mindctx.openAs` 命令支持打开普通 `.md` 文件（实现：`vscode.commands.executeCommand('vscode.openWith', uri, 'mindctx.editor')`）
- 创建和管理 Webview 面板
- **维护 document → webview[] 映射**，同一文件在 split view 中打开多个 webview 时，operation 执行后广播 `treeUpdated` 到所有关联 webview
- 协调 Document 与 Webview 之间的消息通信
- 处理导出文件保存流程（showSaveDialog + workspace.fs.writeFile）

**MindCtxDocument** (implements `CustomDocument`)

职责：
- 持有文件内容和解析后的树结构
- 管理 dirty 状态（通过 `CustomDocumentEditEvent` 通知 VSCode）
- 处理文件保存（debounced write）
- 监听外部文件变更（带冲突检测）

### Activation & Registration

**package.json 中的关键配置：**

```jsonc
{
  "activationEvents": [
    "onCustomEditor:mindctx.editor"
  ],
  "contributes": {
    "customEditors": [{
      "viewType": "mindctx.editor",
      "displayName": "MindCtx",
      "selector": [
        { "filenamePattern": "*.mind.md" }
      ],
      "priority": "default"
    }],
    "menus": {
      "explorer/context": [
        {
          "command": "mindctx.openAs",
          "when": "resourceExtname == .md",
          "group": "navigation"
        }
      ]
    }
  }
}
```

**激活策略：**
- `onCustomEditor:mindctx.editor` — 打开 `.mind.md` 文件时激活（最小性能影响）
- 不使用 `onLanguage:markdown` 或 `workspaceContains`（避免不必要的早期激活）
- Explorer 右键菜单的"以 MindCtx 打开"通过 `menus.explorer/context` 声明式注册，不需要额外 activation event

**Editor Title Actions：**

编辑器标题栏右侧放置常用操作按钮：

```jsonc
"menus": {
  "editor/title": [
    {
      "command": "mindctx.toggleView",
      "when": "activeCustomEditorId == 'mindctx.editor'",
      "group": "navigation"
    },
    {
      "command": "mindctx.export.png",
      "when": "activeCustomEditorId == 'mindctx.editor'",
      "group": "1_export"
    }
  ]
}
```

`mindctx.toggleView` 使用图标区分当前视图状态（大纲图标 / 脑图图标），提供一键切换。

### Webview 安全策略（CSP）

Webview HTML 模板必须包含严格的 CSP：

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  script-src ${webview.cspSource};
  style-src ${webview.cspSource} 'unsafe-inline';
  img-src ${webview.cspSource} data:;
  font-src ${webview.cspSource};
">
```

**Mind Elixir 兼容性说明：**
- `style-src 'unsafe-inline'` — Mind Elixir 通过 JS 设置 inline style，必须放行
- `img-src data:` — Mind Elixir 使用 SVG data URI 作为节点图标，必须放行
- `script-src 'unsafe-eval'` — **待验证**：如果 Mind Elixir 或其依赖内部使用 `new Function()`（与 eval 同受 CSP 限制），则需要添加。Phase 3 实施时必须实际测试 CSP 兼容性，如有问题则添加并注释原因

### Webview 生命周期（retainContextWhenHidden）

**策略：使用 `retainContextWhenHidden: true`**

理由：
- Mind Elixir 实例的 DOM 状态重建成本高（需要重新初始化画布、重绘所有节点）
- 用户切换 tab 再切回时体验应该是即时的，不应闪烁重建
- MindCtx 文件通常单个打开，不太可能同时有大量 tab，内存影响可控

如果后续发现内存问题，可降级为 `retainContextWhenHidden: false` + `webview.getState()/setState()` 方案，但第一版优先体验。

### 通信协议

Extension Host ↔ Webview 通过 `postMessage` 通信，类型定义集中在 `types/messages.ts`：

```typescript
// Extension → Webview
type ExtToWebview =
  | { type: 'init'; tree: MindCtxTree; settings: Settings; state: PersistedViewState | null }
  | { type: 'treeUpdated'; tree: MindCtxTree; reason: 'self' | 'peerEdit' | 'undo' | 'redo' | 'externalChange' }
  | { type: 'themeChanged'; colors: ThemeColors }
  | { type: 'settingsChanged'; settings: Partial<Settings> }
  | { type: 'command'; command: Command }
  | { type: 'error'; message: string; operationId?: string }

// 命令联合类型（仅 Webview 需要参与的命令）
type Command =
  | { name: 'expandAll' }
  | { name: 'collapseAll' }
  | { name: 'toggleView' }
  | { name: 'export.png' }    // 只有 PNG 需要 Webview（html-to-image 截取 DOM）

// Webview → Extension
type WebviewToExt =
  | { type: 'ready' }
  | { type: 'operation'; op: PartialOperation; operationId: string }
  | { type: 'stateSync'; state: TransientViewState }
  | { type: 'exportResult'; format: 'png'; data: string }  // 只有 PNG 从 Webview 返回
  | { type: 'requestSave' }

// 持久化的视图状态（存入 workspaceState，跨 session 保留）
interface PersistedViewState {
  collapsedNodeIds: string[];
  activeView: 'outline' | 'mindmap';
}

// 瞬态视图状态（仅在 session 内同步，不跨 session 持久化）
interface TransientViewState {
  collapsedNodeIds: string[];
  selectedNodeId: string | null;
  activeView: 'outline' | 'mindmap';
  scrollPosition: number;  // 不持久化：打开文件时总是回到顶部
}
```

**消息流说明：**
- `treeUpdated` 的 `reason` 区分来源：`'self'`（自己发起的 op 被 Extension 确认）、`'peerEdit'`（同文件另一个 webview）、`'undo'`/`'redo'`/`'externalChange'`
- `command` 只包含需要 Webview 参与的命令（expandAll/collapseAll/toggleView/export.png）
- OPML/JSON 导出不经过 Webview — Extension host 直接调用 `@mindctx/core` 的 exportOpml/exportJson，因为不依赖 DOM
- 只有 PNG 导出需要 Webview 参与（html-to-image 需要访问脑图 DOM）
- `operation` 消息带 `operationId`，用于 Extension 回传确认或错误时匹配

### 多 Webview 实例同步

**数据流模型：Extension 权威（方案 B）。** Webview 不本地 apply operation，只发送 intent，等 Extension 确认。

```
User edits in Webview A
  → postMessage { type: 'operation', op, operationId } to Extension
  → Extension applyOperation(tree, op)
    - 成功 → fire edit event → broadcast treeUpdated to ALL webviews (including A)
      - Webview A 收到 reason: 'self'（可用于跳过动画/闪烁）
      - Webview B, C 收到 reason: 'peerEdit'
    - 失败 → 发送 { type: 'error', operationId } 到 Webview A，不 fire edit event
```

选择方案 B 的理由：
- 简单，无需 rollback 机制
- postMessage 往返延迟通常 <5ms，用户无感知
- 保证所有 webview 看到的 tree 始终与 Extension host 一致（单一事实来源）

### Operation 错误处理

当 `applyOperation` 失败时（节点 ID 不存在、树结构不一致等）：

1. **不** fire CustomDocumentEditEvent（不影响 undo stack）
2. 发送 `{ type: 'error', operationId }` 到来源 Webview
3. 发送 `treeUpdated { reason: 'self' }` 到来源 Webview（让它重新同步到正确的 tree 状态）
4. 不广播到其他 Webview（因为 tree 没有变化）

Webview 收到 error 后无需特殊处理——因为使用方案 B，Webview 没有乐观更新本地状态，tree signal 会被紧接的 treeUpdated 消息刷新到正确值。

### 文件生命周期

```
打开文件 → readFile → parse → 等待 Webview 'ready' → 发送 init → Webview 渲染
用户编辑 → Webview 发送 operation → Extension applyOperation → 成功: fire edit event + debounced writeFile + 广播 treeUpdated 到所有 webview; 失败: 发送 error + treeUpdated(self) 到来源 webview
手动保存 (Ctrl+S) → 立即 serialize → writeFile → 清除 pending debounce
外部修改 → FileSystemWatcher 触发 → 冲突检测 → re-parse → 广播 treeUpdated 到所有 webview
```

**Debounced Write 策略：**
- 每次 operation 后启动/重置 debounce 计时器（默认 300ms）
- 计时器到期后执行 serialize + writeFile
- 手动 Ctrl+S 立即写入并清除 pending timer
- 在有 pending write 时，忽略 FileSystemWatcher 触发的事件（因为是自己即将写入的内容）

**外部修改冲突检测：**
- 写入前记录文件内容的 hash
- FileSystemWatcher 触发时，对比磁盘文件 hash 与上次写入的 hash
- 如果 hash 不匹配且没有 pending write → 外部修改，re-parse 并通知所有 Webview
- 如果有 pending write → 忽略 watcher 事件（自己的写入触发的）
- 如果有 dirty edits 且检测到外部修改 → 弹出提示让用户选择 "Reload" 或 "Overwrite"

### Undo/Redo 架构

**核心原则：VSCode 是 undo stack 的唯一拥有者。**

`@mindctx/core` 的 undo 模块仅提供：
- `invertOperation(op: Operation): Operation` — 计算操作的逆操作
- `applyOperation(tree: MindCtxTree, op: PartialOperation): Operation` — 应用操作并返回完整 Operation（含 old 值，用于逆操作）

Extension 端的流程：
```
Webview operation → applyOperation(tree, partialOp) → 得到 fullOp
  → fire CustomDocumentEditEvent { undo: () => applyInverse(fullOp), redo: () => reapply(fullOp) }
  → VSCode 将 edit 推入其 undo stack
  → 广播 treeUpdated { reason: 'self' } 到来源 webview + { reason: 'peerEdit' } 到其余

VSCode Ctrl+Z → 调用 edit.undo() → applyOperation(tree, invertedOp)
  → 广播 treeUpdated { reason: 'undo' } → 所有 Webview 更新
```

这样：
- VSCode 标题栏的 dirty dot 自然工作
- Ctrl+Z/Y 由 VSCode 驱动，粒度与 edit event 一致（1 op = 1 undo step）
- 不存在两个 undo stack 失步的问题
- 多 webview 场景下 undo 结果自动广播

### 设置优先级

**规则：文件 frontmatter 优先于 VSCode 全局设置（与 Obsidian 版一致）。**

解析顺序：
1. 读取文件 frontmatter（`heading-depth`、`default-view` 等）
2. 读取 VSCode 设置（`mindctx.headingDepth`、`mindctx.defaultView` 等）
3. frontmatter 中有值则使用 frontmatter，否则 fallback 到 VSCode 设置

发送给 Webview 的 `settings` 对象是合并后的最终值。Webview 不需要知道值来自哪里。

### 导入工作流

**导入创建新文件（不替换当前文档）：**

```
用户执行 mindctx.import.opml
  → Extension 弹出 showOpenDialog({ filters: { 'OPML': ['opml'] } })
  → 用户选择文件 → 读取 → @mindctx/core importOpml() 解析为 MindCtxTree
  → Extension 弹出 showSaveDialog({ filters: { 'MindCtx': ['mind.md'] } })
  → 用户选择保存路径 → serialize(tree) → writeFile
  → 自动打开新创建的 .mind.md 文件
```

理由：
- 导入是"从外部格式转换"，语义上应该创建新文件
- 不影响当前打开的文档，不需要与 undo 系统交互
- 如果用户想替换当前文档内容，可以手动复制粘贴（低频场景不值得专门支持）

## Webview 层

### WebviewBridge 适配层

这是 VSCode 版与 Obsidian 版的**关键差异点**。Obsidian 版中组件通过 props 直接接收 signals 和 `executeOperation` 回调；VSCode 版需要通过 postMessage 桥接。

**WebviewBridge** 提供与 Obsidian 版 `MindCtxView` 相同的接口：

```typescript
class WebviewBridge {
  // Signals（组件通过这些信号读取状态）
  readonly tree: Signal<MindCtxTree | null>;
  readonly settings: Signal<Settings>;
  readonly theme: Signal<ThemeColors>;
  readonly activeView: Signal<'outline' | 'mindmap'>;

  // 操作接口（组件调用这些方法，不本地 apply，等 Extension 确认后通过 treeUpdated 更新）
  executeOperation(op: PartialOperation): void;  // → postMessage to extension, 等待 treeUpdated 回传
  syncState(state: Partial<TransientViewState>): void;

  // 命令处理（Extension 发来的 command 消息）
  onCommand(handler: (cmd: Command) => void): void;

  // 内部：监听 extension 消息，更新 signals
  private handleMessage(msg: ExtToWebview): void;
}
```

组件代码的改动：
- 将 `props.executeOperation(op)` 改为 `bridge.executeOperation(op)`
- 将 `props.tree` signal 改为 `bridge.tree`
- 其余 UI 逻辑（渲染、拖拽、键盘事件）原样保留

### 视图组件

从 Obsidian 版移植，通过 WebviewBridge 适配：

1. **OutlineView** — 替换 props 接口为 bridge 调用，UI 逻辑不变
2. **MindMapView** — 替换 props 接口，容器尺寸改用 `ResizeObserver` 监听 Webview 窗口
3. **SearchBar** — 原样复用（纯 UI 组件）
4. **DetailPanel** — 备注编辑提交改为 `bridge.executeOperation`
5. **ViewSwitcher** — 原样复用

### 主题适配

Webview 无法直接继承 VSCode CSS 变量。方案：
- Extension 读取当前主题类型（`window.activeColorTheme.kind`）和颜色（通过已知的 VSCode token 色值）
- 将关键色值通过 init 消息传入 Webview
- Webview 在 `<html>` 元素上设置 CSS 变量，组件通过变量引用颜色
- 监听 `onDidChangeActiveColorTheme` 事件，发送 `themeChanged` 消息动态更新

### 资源加载

Webview 使用 `webview.asWebviewUri()` 加载打包好的 JS/CSS。Mind Elixir 打包进 webview bundle。

**Webview 构建输出：** esbuild 配置为 JS 和 CSS 分离输出：
- `webview.js` — 所有 Preact 组件 + Mind Elixir（单 bundle）
- `webview.css` — 所有组件样式（esbuild CSS loader 将 import 的 CSS 合并输出）

**HTML 模板加载方式：**
```html
<link rel="stylesheet" href="${webview.asWebviewUri(cssUri)}">
<script defer src="${webview.asWebviewUri(jsUri)}"></script>
```

CSP 中的 `style-src ${webview.cspSource} 'unsafe-inline'` 已覆盖两种来源（外部 CSS 文件 + Mind Elixir 内联样式）。

## 状态持久化

使用 VSCode `ExtensionContext.workspaceState` 存储每个文件的视图状态：

```typescript
// key: "mindctx:viewState:{filePath}"
// 仅持久化跨 session 有意义的状态
interface PersistedViewState {
  collapsedNodeIds: string[];
  activeView: 'outline' | 'mindmap';
  // 不持久化 selectedNodeId（打开时无选中）
  // 不持久化 scrollPosition（打开时回到顶部）
}
```

- Webview 通过 `stateSync` 消息上报状态变更
- Extension 提取需要持久化的字段，写入 workspaceState（debounced，500ms）
- 文件重新打开时从 workspaceState 读取并通过 init 消息发送

## 导出流程

**OPML/JSON 导出（Extension host 直接完成，不经过 Webview）：**

```
用户执行 mindctx.export.opml 命令
  → Extension 直接调用 @mindctx/core 的 exportOpml(tree)
  → Extension 调用 vscode.window.showSaveDialog({ filters: { 'OPML': ['opml'] } })
  → 用户选择路径 → workspace.fs.writeFile
  → 显示 "导出成功" 通知
```

JSON 同理。因为 OPML/JSON 导出只需要 tree 数据（Extension host 已持有），不依赖 DOM，无需 Webview 参与。

**PNG 导出（需要 Webview 参与）：**

```
用户执行 mindctx.export.png 命令
  → Extension 发送 { type: 'command', command: { name: 'export.png' } } 到 Webview
  → Webview 使用 html-to-image 从脑图 DOM 生成 data URL
  → Webview 发送 { type: 'exportResult', format: 'png', data: dataUrl }
  → Extension 调用 vscode.window.showSaveDialog({ filters: { 'PNG': ['png'] } })
  → 用户选择路径 → Extension 解码 base64 → workspace.fs.writeFile
  → 显示 "导出成功" 通知
```

PNG 导出只在脑图视图下可用（大纲视图下该命令 disabled 或提示切换视图）。

## 功能清单（第一版）

### 核心编辑
- [x] 双视图（大纲 + 脑图）切换
- [x] 大纲：拖拽排序、行内编辑、键盘导航
- [x] 脑图：Mind Elixir 渲染、拖拽重组、右键菜单、缩放
- [x] 快捷键：Tab/Shift+Tab、Enter、Delete、Ctrl+Z/Y、Ctrl+↑/↓
- [x] 任务复选框切换
- [x] 节点详情面板（备注编辑）
- [x] 搜索筛选（Ctrl+F）
- [x] 撤销/重做（VSCode 原生 undo stack 驱动，不维护独立 undo 栈）

### 导入导出
- [x] 导入 OPML（创建新文件）
- [x] 导入 FreeMind（创建新文件）
- [x] 导出 OPML（Extension host 直接 exportOpml(tree) → showSaveDialog → writeFile）
- [x] 导出 JSON（Extension host 直接 exportJson(tree) → showSaveDialog → writeFile）
- [x] 导出 PNG（command → Webview html-to-image → exportResult → showSaveDialog → writeFile）

### AI 命令
- [x] 复制为 AI 上下文（Extension host 直接调用 buildContext(tree) → clipboard.writeText，不经过 Webview）

### 命令
- [x] `mindctx.create` — 创建新 .mind.md 文件
- [x] `mindctx.openAs` — 以 MindCtx 打开当前 .md 文件（`vscode.openWith(uri, 'mindctx.editor')`）
- [x] `mindctx.toggleView` — 切换大纲/脑图
- [x] `mindctx.expandAll` — 展开全部
- [x] `mindctx.collapseAll` — 折叠全部
- [x] `mindctx.import.opml` — 导入 OPML（showOpenDialog → parse → showSaveDialog → writeFile → open）
- [x] `mindctx.import.freemind` — 导入 FreeMind（同上）
- [x] `mindctx.export.opml` — 导出 OPML
- [x] `mindctx.export.json` — 导出 JSON
- [x] `mindctx.export.png` — 导出 PNG
- [x] `mindctx.copyAIContext` — 复制为 AI 上下文

**命令 Enablement：** 所有需要活跃 MindCtx 编辑器的命令添加 enablement 条件：

```jsonc
"commands": [
  { "command": "mindctx.toggleView", "title": "MindCtx: Toggle View",
    "enablement": "activeCustomEditorId == 'mindctx.editor'" },
  { "command": "mindctx.expandAll", "title": "MindCtx: Expand All",
    "enablement": "activeCustomEditorId == 'mindctx.editor'" },
  { "command": "mindctx.export.png", "title": "MindCtx: Export as PNG",
    "enablement": "activeCustomEditorId == 'mindctx.editor'" }
  // ... 同理
]
```

`mindctx.create`、`mindctx.openAs`、`mindctx.import.*` 不需要 enablement（不依赖活跃编辑器）。

### 扩展配置（contributes.configuration）
- `mindctx.defaultView`: `"outline"` | `"mindmap"`（文件 frontmatter `default-view` 优先）
- `mindctx.headingDepth`: number (1-6, default 3)（文件 frontmatter `heading-depth` 优先）
- `mindctx.autoSaveDelay`: number (ms, default 300)
- `mindctx.outlineFontSize`: number (px, default 14)
- `mindctx.showNotePreview`: boolean (default true)
- `mindctx.mindmapDirection`: `"side"` | `"vertical"` | `"right"` | `"left"`

### 测试策略

**Core 包（Vitest）：**
- 保持现有 125 个测试
- 新增 importers/exporters/bridge 的测试（从 Obsidian 版迁移）

**Extension 集成测试（@vscode/test-electron）：**
- 打开 .mind.md 文件 → 验证 Custom Editor 激活
- 编辑 → 保存 → 读取文件验证内容正确
- Undo/Redo 验证
- 外部修改检测验证
- 命令执行验证
- 多 webview 同步验证（split view）

**Webview 组件测试（Vitest + jsdom）：**
- WebviewBridge 消息收发测试（mock postMessage）
- 组件渲染测试（通过 bridge mock 注入数据）

**通信协议测试（Vitest）：**
- 消息序列化/反序列化正确性
- 多 webview 广播逻辑
- 状态同步一致性
- 错误消息处理
- Export command → exportResult 往返

## 不做的功能（第一版）

- 嵌入块（VSCode 没有等价概念）
- 虚拟滚动（可后续添加）
- `webview.getState()/setState()` 状态恢复（使用 retainContextWhenHidden 代替）

## 已知限制（第一版接受，后续优化）

**全量 tree 传输：** 每次 operation 后通过 postMessage 广播完整 MindCtxTree 给所有 Webview。对于大文件（1000+ 节点）的 structured clone 可能有数毫秒的性能代价。第一版接受此方案（简单、正确），后续可优化为增量传输（只发 operation + affected subtree 的 diff）。

## 平台适配映射

| Obsidian | VSCode |
|----------|--------|
| `vault.read/modify` | `workspace.fs.readFile/writeFile` |
| `ItemView` | `CustomEditorProvider` + Webview |
| `registerExtensions` | `customEditors` in package.json |
| `addCommand` | `commands.registerCommand` |
| CSS 变量继承 | Extension 读取主题色 → postMessage → Webview CSS 变量 |
| ribbon icon | Explorer context menu + editor/title actions |
| settings tab | `contributes.configuration` |
| `vault` state 持久化 | `ExtensionContext.workspaceState` |
| 直接 DOM 访问 | Webview CSP 隔离 + `asWebviewUri` 资源加载 |

## 技术栈

| 层面 | 技术 |
|------|------|
| 语言 | TypeScript 5.4, strict, ES2022 |
| Monorepo | pnpm workspace |
| Core 构建 | tsup |
| Extension 构建 | esbuild |
| Webview UI | Preact + @preact/signals |
| 脑图 | Mind Elixir v4 |
| Markdown 解析 | unified + remark (GFM + math) |
| 测试 | Vitest (core + webview + protocol), @vscode/test-electron (extension) |
| 包管理 | pnpm |

## 迁移策略

1. **Phase 0**: Monorepo 重构
   - 提取 core 包（parser, serializer, operations, undo, hash, types, importers, exporters, bridge, ai, debounce）
   - Obsidian 插件改为引用 @mindctx/core
   - **验证点**：Obsidian 插件的 release artifact（main.js, manifest.json, styles.css）结构不变，所有现有测试通过
2. **Phase 1**: VSCode 扩展骨架
   - package.json（activationEvents, customEditors, contributes）
   - Custom Editor Provider + Webview HTML 模板（含 CSP）+ retainContextWhenHidden
   - 文件读写 + debounced save
   - 通信协议类型定义 + 基础 postMessage 收发
   - WebviewBridge 基础实现
   - 多 webview 实例管理（document → webview[] 映射）
3. **Phase 2**: 大纲视图
   - 移植 OutlineView 组件（通过 WebviewBridge 适配）
   - 键盘快捷键、拖拽排序、行内编辑
   - Undo/Redo（VSCode edit tracking 集成）
4. **Phase 3**: 脑图视图
   - 移植 MindMapView + Mind Elixir 集成（注意 CSP 兼容）
   - 右键菜单、缩放控制
   - 视图切换
5. **Phase 4**: 命令、导入导出、AI 功能
   - 注册所有命令
   - 导入流程（showOpenDialog → parse → showSaveDialog → writeFile → open）
   - 导出流程（command → Webview → exportResult → showSaveDialog → writeFile）
   - AI 上下文复制
6. **Phase 5**: 主题适配、设置、状态持久化
   - 读取 VSCode 主题色并映射
   - contributes.configuration 注册 + 设置优先级（frontmatter > global）
   - workspaceState 折叠状态持久化
   - 外部文件修改冲突检测
7. **Phase 6**: 测试补全、文档、发布准备
   - Extension 集成测试（含多 webview 同步）
   - Webview 组件测试
   - 通信协议测试
   - README + CHANGELOG + marketplace 发布配置
