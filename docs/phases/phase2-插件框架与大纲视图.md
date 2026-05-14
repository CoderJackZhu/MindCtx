# Phase 2：Obsidian 插件框架 + 大纲视图

## 前置条件

Phase 1 已完成，以下模块可用：

```
src/core/types.ts        — 所有类型定义
src/core/parser.ts       — parse(markdown) → MindCtxTree
src/core/serializer.ts   — serialize(tree) → markdown
src/core/operations.ts   — applyOperation(tree, op) → Operation
src/core/undo.ts         — UndoManager 类
src/core/hash.ts         — ID 生成
```

## 目标

将 Phase 1 的核心引擎包装为 Obsidian 插件，实现：
1. `.mind.md` 文件自动识别和打开
2. 完整的幕布式大纲视图
3. 拖拽、键盘快捷键、inline 编辑
4. 编辑后自动回写 Markdown 文件
5. Undo/Redo 快捷键

## 项目结构变更

在现有结构基础上添加：

```
manifest.json              # Obsidian 插件清单
styles.css                 # 插件样式
esbuild.config.mjs         # 构建配置
src/
  main.ts                  # 插件入口
  constants.ts             # 常量定义
  views/
    MindCtxView.tsx        # Obsidian ItemView 子类（需要 .tsx 支持 JSX）
    MindCtxRoot.tsx        # 根 Preact 组件（包装 Toolbar + 视图，Phase 3 扩展视图切换）
    OutlineView.tsx        # 大纲 Preact 组件（根）
    components/
      OutlineNode.tsx      # 单个节点组件
      OutlineToolbar.tsx   # 工具栏（展开/折叠全部按钮，预留视图切换位置供 Phase 3 填充）
      InlineEditor.tsx     # 行内编辑器
      DragIndicator.tsx    # 拖拽目标指示器
  settings/
    settings.ts            # 设置定义和 UI
  utils/
    debounce.ts            # 防抖工具
```

**注意**：以下组件在本阶段不实现，将在后续阶段添加：
- `ViewSwitcher.tsx` → Phase 3（脑图视图）
- `DetailPanel.tsx` → Phase 5（打磨）
- `SearchBar.tsx` → Phase 5（打磨）

### 新增依赖

```json
{
  "devDependencies": {
    "obsidian": "^1.5",
    "@types/node": "^20",
    "esbuild": "^0.20",
    "preact": "^10.19",
    "@preact/signals": "^1.2"
  }
}
```

**为什么用 Preact：** 体积仅 3KB（vs React 40KB+），API 与 React 基本相同，适合插件场景。使用 `@preact/signals` 做响应式状态避免引入 Redux/Zustand。

### tsconfig.json 更新

Phase 1 的 tsconfig.json 需要添加 JSX 支持，更新 `compilerOptions`：

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
    "sourceMap": true,
    "jsx": "react",
    "jsxFactory": "h",
    "jsxFragmentFactory": "Fragment"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**注意**：`jsxFactory: "h"` 和 `jsxFragmentFactory: "Fragment"` 对应 Preact 的 API。每个 .tsx 文件顶部需要 `import { h, Fragment } from 'preact'`（或依赖 esbuild 的自动注入）。

---

## constants.ts

```typescript
// src/constants.ts

export const MINDCTX_VIEW_TYPE = 'mindctx-view';
export const PLUGIN_ID = 'mindctx';
```

---

## manifest.json

```json
{
  "id": "mindctx",
  "name": "MindCtx",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "Markdown-first structured outline editor with mind map view",
  "author": "MindCtx",
  "isDesktopOnly": false
}
```

---

## 模块一：main.ts — 插件入口

### 职责

- 注册自定义视图类型
- 注册文件扩展名关联
- 注册命令
- 管理设置
- 处理文件打开事件

### 核心逻辑

```typescript
import { Plugin, WorkspaceLeaf, TFile } from 'obsidian';

const MINDCTX_VIEW_TYPE = 'mindctx-view';

export default class MindCtxPlugin extends Plugin {
  settings: MindCtxSettings;

  // 插件级写入标记：所有 MindCtxView 实例共享
  // 用于同一文件在多个视图中打开时，避免 View A 的写入触发 View B 的重载
  recentWrites = new Map<string, number>(); // filePath → timestamp

  async onload() {
    // 1. 加载设置
    await this.loadSettings();

    // 2. 注册视图
    this.registerView(MINDCTX_VIEW_TYPE, (leaf) => new MindCtxView(leaf, this));

    // 3. 注册 .mind.md 扩展名关联
    //    注意：Obsidian 的 registerExtensions 需要不含点的扩展名
    //    但 .mind.md 是双扩展名，需要用 file-open 事件拦截
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file && this.isMindCtxFile(file)) {
          this.activateMindCtxView(file);
        }
      })
    );

    // 4. 注册命令
    this.addCommand({
      id: 'create',
      name: '创建 MindCtx 文件',
      callback: () => this.createNewMindCtx(),
    });

    this.addCommand({
      id: 'open-as-mindctx',
      name: '以 MindCtx 打开当前文件',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !file.path.endsWith('.md')) return false;
        if (checking) return true;
        this.activateMindCtxView(file);
      },
    });

    this.addCommand({
      id: 'expand-all',
      name: '展开全部节点',
      checkCallback: (checking) => {
        const view = this.getActiveMindCtxView();
        if (!view) return false;
        if (checking) return true;
        view.collapsedIds.value = new Set();
      },
    });

    this.addCommand({
      id: 'collapse-all',
      name: '折叠全部节点',
      checkCallback: (checking) => {
        const view = this.getActiveMindCtxView();
        if (!view?.tree) return false;
        if (checking) return true;
        const ids = new Set<string>();
        function walk(node: MindCtxNode) {
          if (node.children.length > 0) ids.add(node.id);
          node.children.forEach(walk);
        }
        view.tree.root.children.forEach(walk);
        view.collapsedIds.value = ids;
      },
    });

    // 5. 设置页
    this.addSettingTab(new MindCtxSettingTab(this.app, this));
  }

  isMindCtxFile(file: TFile): boolean {
    // 方式一：文件名匹配
    if (file.path.endsWith('.mind.md')) return true;
    // 方式二：frontmatter 检查（需要读取缓存的 metadata）
    const cache = this.app.metadataCache.getFileCache(file);
    return cache?.frontmatter?.mindctx === true;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateMindCtxView(file: TFile) {
    // 查找已存在的 MindCtx 视图
    const existing = this.app.workspace.getLeavesOfType(MINDCTX_VIEW_TYPE)
      .find(leaf => (leaf.view as MindCtxView).file?.path === file.path);
    if (existing) {
      this.app.workspace.setActiveLeaf(existing);
      return;
    }
    // 在当前 leaf 打开
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: MINDCTX_VIEW_TYPE, state: { file: file.path } });
  }

  async createNewMindCtx() {
    const fileName = `新建文档 ${Date.now()}.mind.md`;
    const content = `---\nmindctx: true\ndefault-view: outline\n---\n\n# ${fileName.replace('.mind.md', '')}\n\n## 主题一\n\n## 主题二\n`;
    const file = await this.app.vault.create(fileName, content);
    await this.activateMindCtxView(file);
  }

  // 获取当前活跃的 MindCtx 视图实例（供命令注册 checkCallback 使用）
  getActiveMindCtxView(): MindCtxView | null {
    const leaf = this.app.workspace.activeLeaf;
    if (leaf?.view instanceof MindCtxView) {
      return leaf.view;
    }
    return null;
  }
}
```

---

## 模块二：MindCtxView.ts — Obsidian 视图容器

### 职责

- 继承 Obsidian `ItemView`
- 管理文件读取和写入
- 持有 MindCtxTree（当前 AST）
- 持有 UndoManager
- 挂载 Preact 大纲组件
- 处理外部文件修改事件

### 核心结构

```typescript
import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import { render } from 'preact';
import { signal } from '@preact/signals';
import { parse } from '../core/parser';
import { serialize } from '../core/serializer';
import { applyOperation } from '../core/operations';
import { UndoManager } from '../core/undo';
import type { MindCtxTree, PartialOperation } from '../core/types';

export class MindCtxView extends ItemView {
  plugin: MindCtxPlugin;             // 插件实例引用
  file: TFile | null = null;
  tree: MindCtxTree | null = null;
  undoManager = new UndoManager();

  constructor(leaf: WorkspaceLeaf, plugin: MindCtxPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  // 每个视图实例独立的 signals（避免多实例串扰）
  treeSignal = signal<MindCtxTree | null>(null);
  collapsedIds = signal<Set<string>>(new Set());
  selectedNodeId = signal<string | null>(null);
  editingNodeId = signal<string | null>(null);

  private preactMounted = false;
  private debouncedWrite: ReturnType<typeof debounce> | null = null;

  getViewType() { return MINDCTX_VIEW_TYPE; }
  getDisplayText() { return this.file?.basename ?? 'MindCtx'; }
  getIcon() { return 'list-tree'; }

  // 状态持久化：保存文件路径以便 Obsidian 重启后恢复
  getState() {
    return { file: this.file?.path ?? '' };
  }

  async setState(state: { file?: string }, result: any) {
    if (state.file) {
      this.file = this.app.vault.getAbstractFileByPath(state.file) as TFile;
      await this.loadFile();
      this.renderView();
    }
    return super.setState(state, result);
  }

  async onOpen() {
    // 初始化 debouncedWrite（此时 plugin.settings 已可用）
    this.debouncedWrite = debounce(() => this.writeFile(), this.plugin.settings.autoSaveDelay, { maxWait: 2000 });

    // 从 state 中恢复文件路径
    const state = this.getState();
    if (state.file) {
      this.file = this.app.vault.getAbstractFileByPath(state.file) as TFile;
      await this.loadFile();
    }
    this.renderView();

    // 监听外部文件修改（使用插件级写入标记 recentWrites，支持同一文件在多个视图中打开）
    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (file === this.file) {
          // 检查是否由本插件任一视图引起的修改（200ms 内的写入视为内部修改）
          const lastWrite = this.plugin.recentWrites.get(file.path);
          if (lastWrite && Date.now() - lastWrite < 200) return;

          // 外部修改：重新解析，清空 undo 栈
          const content = await this.app.vault.read(file);
          this.tree = parse(content, { filePath: file.path });
          this.treeSignal.value = this.tree;
          this.undoManager.clear();
        }
      })
    );
  }

  async onClose() {
    // 清理：取消 debounced write、unmount Preact
    this.debouncedWrite?.cancel();
    const container = this.containerEl.children[1];
    render(null, container);
    this.preactMounted = false;
  }

  async loadFile() {
    if (!this.file) return;
    const content = await this.app.vault.read(this.file);
    this.tree = parse(content, { filePath: this.file.path });
    this.treeSignal.value = this.tree;
    this.undoManager.clear();
  }

  // 文件回写（debounced with maxWait）
  scheduleWrite() {
    this.debouncedWrite?.();
  }

  async writeFile() {
    if (!this.file || !this.tree) return;
    const content = serialize(this.tree);
    // 插件级写入标记：所有 MindCtxView 实例共享，防止 View A 写入触发 View B 重载
    this.plugin.recentWrites.set(this.file.path, Date.now());
    await this.app.vault.modify(this.file, content);
  }

  // 执行操作的统一入口
  executeOperation(op: PartialOperation) {
    if (!this.tree) return;
    const fullOp = applyOperation(this.tree, op);
    this.undoManager.push([fullOp]);
    this.treeSignal.value = { ...this.tree };  // 触发 signal 更新
    this.scheduleWrite();
  }

  undo() {
    if (!this.tree) return;
    this.undoManager.undo(this.tree);
    this.treeSignal.value = { ...this.tree };
    this.scheduleWrite();
  }

  redo() {
    if (!this.tree) return;
    this.undoManager.redo(this.tree);
    this.treeSignal.value = { ...this.tree };
    this.scheduleWrite();
  }

  renderView() {
    const container = this.containerEl.children[1]; // Obsidian view content area
    // 只在首次挂载时 render，后续通过 signals 驱动更新
    if (!this.preactMounted) {
      render(
        <MindCtxRoot
          treeSignal={this.treeSignal}
          collapsedIds={this.collapsedIds}
          selectedNodeId={this.selectedNodeId}
          editingNodeId={this.editingNodeId}
          onOperation={(op) => this.executeOperation(op)}
          onUndo={() => this.undo()}
          onRedo={() => this.redo()}
          onExpandAll={() => { this.collapsedIds.value = new Set(); }}
          onCollapseAll={() => {
            if (!this.tree) return;
            const ids = new Set<string>();
            function walk(node: MindCtxNode) {
              if (node.children.length > 0) ids.add(node.id);
              node.children.forEach(walk);
            }
            this.tree.root.children.forEach(walk);
            this.collapsedIds.value = ids;
          }}
        />,
        container
      );
      this.preactMounted = true;
    }
  }
}
```

### MindCtxRoot 包装组件

Phase 2 中 `MindCtxRoot` 仅包含大纲视图。Phase 3 会在此组件中添加视图切换逻辑和脑图视图的条件渲染，无需修改 `MindCtxView.renderView()` 方法。

```typescript
// src/views/MindCtxRoot.tsx

import { h } from 'preact';
import { OutlineToolbar } from './components/OutlineToolbar';
import { OutlineView } from './OutlineView';

// Phase 2 的 Props 定义。Phase 3 将扩展此接口添加 currentView、onSwitchView、onCollapsedChange 等字段
interface MindCtxRootProps extends OutlineViewProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

function MindCtxRoot(props: MindCtxRootProps) {
  return (
    <div class="mindctx-container">
      <OutlineToolbar
        onExpandAll={props.onExpandAll}
        onCollapseAll={props.onCollapseAll}
      />
      <OutlineView {...props} />
    </div>
  );
}
```

---

## 模块三：OutlineView.tsx — 大纲视图根组件

### 布局结构

```
┌─ OutlineToolbar ──────────────────────────┐
│ [展开全部] [折叠全部] [搜索...] 大纲|脑图  │
├───────────────────────────────────────────┤
│ OutlineTree (可滚动区域)                   │
│   OutlineNode                             │
│   OutlineNode                             │
│     OutlineNode (子节点，缩进)             │
│   OutlineNode                             │
│   ...                                     │
└───────────────────────────────────────────┘
```

### Props 接口

```typescript
import type { Signal } from '@preact/signals';

interface OutlineViewProps {
  treeSignal: Signal<MindCtxTree | null>;
  collapsedIds: Signal<Set<string>>;
  selectedNodeId: Signal<string | null>;
  editingNodeId: Signal<string | null>;
  onOperation: (op: PartialOperation) => void;
  onUndo: () => void;
  onRedo: () => void;
}
```

### 状态管理（使用 @preact/signals，由 MindCtxView 实例持有）

signals 由 `MindCtxView` 实例创建并通过 props 传入组件，确保多个 MindCtx 视图实例之间状态完全隔离。

```typescript
// 组件内的局部 UI 状态（不需要在视图间共享）
const searchQuery = signal<string>('');
const dragState = signal<DragState | null>(null);

interface DragState {
  draggedId: string;
  targetId: string | null;
  position: 'before' | 'after' | 'child';
}
```

---

## 模块四：OutlineNode.tsx — 节点组件

### 渲染结构

每个节点渲染为一行，包含：

```
[缩进空间][折叠箭头][拖拽手柄][复选框/圆点][标题文本][note预览]
```

### Props

```typescript
interface OutlineNodeProps {
  node: MindCtxNode;
  depth: number;           // 用于计算缩进
  isSelected: boolean;
  isEditing: boolean;
  isCollapsed: boolean;
  readonly?: boolean;      // 预留：Phase 4 嵌入块只读模式使用
  onSelect: () => void;
  onToggleCollapse: () => void;
  onStartEdit: () => void;
  onEndEdit: (newTitle: string) => void;
  onDragStart: () => void;
  onDragOver: (position: 'before' | 'after' | 'child') => void;
  onDrop: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
}
```

当 `readonly === true` 时：不渲染拖拽手柄、不响应编辑操作、不绑定 draggable 事件。Phase 2 中不需要使用此 prop，仅预留接口定义。

### 缩进规则

```css
每层缩进 = 24px
节点行高 = 32px
最大显示深度 = 不限
```

### 折叠箭头

- 有子节点时显示 ▸（折叠）或 ▾（展开）
- 无子节点时显示空白占位

### 拖拽手柄

- 显示为 ⋮⋮ 图标
- 仅 hover 时显示
- 触发 HTML5 Drag and Drop

---

## 模块五：拖拽逻辑

### 拖拽目标判定

当拖拽到目标节点上方时，根据鼠标位置判断目标：

```
节点区域高度 = 32px

鼠标在上 1/4 区域（0-8px）：  插入为目标的前一个兄弟 → position = 'before'
鼠标在下 1/4 区域（24-32px）：插入为目标的后一个兄弟 → position = 'after'
鼠标在中间 2/4 区域（8-24px）：插入为目标的最后一个子节点 → position = 'child'
```

### 拖拽指示器

- `before`: 在目标节点上方显示蓝色水平线
- `after`: 在目标节点下方显示蓝色水平线
- `child`: 目标节点背景高亮为浅蓝色

### 拖拽限制

- 不能拖拽到自己的子孙节点下（会造成循环）
- 检查方法：从 target 向上遍历，如果遇到 dragged 则禁止

### Drop 后的操作映射

```typescript
import { findNode, findParent, findIndex } from '../core/operations';
import type { PartialOperation } from '../core/types';

function handleDrop(draggedId: string, targetId: string, position: string, tree: MindCtxTree, onOperation: (op: PartialOperation) => void) {
  const target = findNode(tree.root, targetId);
  const targetParent = findParent(tree.root, targetId);

  switch (position) {
    case 'before': {
      const idx = findIndex(targetParent, targetId);
      onOperation({ type: 'move', nodeId: draggedId, newParentId: targetParent.id, index: idx });
      break;
    }
    case 'after': {
      const idx = findIndex(targetParent, targetId) + 1;
      onOperation({ type: 'move', nodeId: draggedId, newParentId: targetParent.id, index: idx });
      break;
    }
    case 'child': {
      onOperation({ type: 'move', nodeId: draggedId, newParentId: targetId, index: target.children.length });
      break;
    }
  }
}
```

---

## 模块六：键盘快捷键

在 OutlineView 组件上注册全局键盘事件：

| 快捷键 | 条件 | 行为 |
|--------|------|------|
| Enter | 非编辑态，有选中节点 | 在选中节点后创建同级节点，进入编辑 |
| Enter | 编辑态 | 确认编辑，退出编辑态 |
| Escape | 编辑态 | 取消编辑，恢复原标题 |
| Tab | 有选中节点 | indent（节点变为上一个兄弟的子节点） |
| Shift+Tab | 有选中节点 | outdent（节点变为父节点的兄弟） |
| ↑ | 非编辑态 | 选中上一个可见节点 |
| ↓ | 非编辑态 | 选中下一个可见节点 |
| Ctrl/Cmd+↑ | 有选中节点 | moveUp |
| Ctrl/Cmd+↓ | 有选中节点 | moveDown |
| Ctrl/Cmd+Z | 任何时候 | undo |
| Ctrl/Cmd+Shift+Z | 任何时候 | redo |
| Delete/Backspace | 非编辑态，有选中节点 | 删除节点 |
| F2 或双击 | 有选中节点 | 进入编辑 |
| Ctrl/Cmd+Shift+. | 有选中节点 | 折叠/展开 |

### 可见节点遍历

上/下方向键需要遍历"可见"节点（折叠节点的子节点不可见）：

```typescript
function getVisibleNodes(root: MindCtxNode, collapsedIds: Set<string>): MindCtxNode[] {
  const result: MindCtxNode[] = [];
  function walk(node: MindCtxNode) {
    result.push(node);
    if (!collapsedIds.has(node.id)) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }
  for (const child of root.children) {
    walk(child);
  }
  return result;
}
```

---

## 模块 6.5：OutlineToolbar.tsx — 工具栏组件

### 职责

大纲视图顶部的工具栏，提供展开全部/折叠全部按钮。预留视图切换和搜索位置供后续 Phase 填充。

### Props

```typescript
interface OutlineToolbarProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  // Phase 3 添加：currentView, onSwitchView
  // Phase 5 添加：searchQuery, onSearchChange
}
```

### 实现

```tsx
// src/views/components/OutlineToolbar.tsx

import { h } from 'preact';

interface OutlineToolbarProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function OutlineToolbar({ onExpandAll, onCollapseAll }: OutlineToolbarProps) {
  return (
    <div class="mindctx-toolbar">
      <button
        class="mindctx-toolbar-btn"
        onClick={onExpandAll}
        title="展开全部"
      >
        展开全部
      </button>
      <button
        class="mindctx-toolbar-btn"
        onClick={onCollapseAll}
        title="折叠全部"
      >
        折叠全部
      </button>
      {/* Phase 3: 此处添加 ViewSwitcher 组件 */}
      {/* Phase 5: 此处添加 SearchBar 组件 */}
    </div>
  );
}
```

### 样式

工具栏样式已在模块十 `styles.css` 中定义（`.mindctx-toolbar`）。

---

## 模块七：InlineEditor.tsx

### 行为

- 双击节点标题或按 F2 进入编辑
- 显示为一个无边框的 `<input>` 或 `contenteditable <span>`
- Enter 确认，Escape 取消
- 失去焦点时自动确认
- 确认后触发 `onOperation({ type: 'rename', ... })`

### 实现建议

使用 `<input>` 更简单：

```tsx
function InlineEditor({ value, onConfirm, onCancel }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      class="mindctx-inline-editor"
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onConfirm(e.currentTarget.value); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      onBlur={(e) => onConfirm(e.currentTarget.value)}
    />
  );
}
```

---

## 模块八：debounce.ts

```typescript
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number,
  options?: { maxWait?: number }
): T & { cancel: () => void } {
  let timer: number | null = null;
  let firstCallTime: number | null = null;

  const debounced = (...args: any[]) => {
    const now = Date.now();
    if (timer) clearTimeout(timer);

    // 记录首次调用时间（连续调用的起始点）
    if (firstCallTime === null) {
      firstCallTime = now;
    }

    // maxWait 到达时立即执行
    if (options?.maxWait && now - firstCallTime >= options.maxWait) {
      fn(...args);
      firstCallTime = null;
      return;
    }

    timer = window.setTimeout(() => {
      fn(...args);
      timer = null;
      firstCallTime = null;
    }, delay);
  };

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    firstCallTime = null;
  };

  return debounced as any;
}
```

---

## 模块九：settings.ts

```typescript
export interface MindCtxSettings {
  defaultView: 'outline' | 'mindmap';
  defaultHeadingDepth: number;
  mindmapDirection: 'side' | 'right' | 'left';
  autoSaveDelay: number;
  enableVirtualScroll: boolean;
  virtualScrollThreshold: number;
  outlineFontSize: number;
  showNotePreview: boolean;
  embedDefaultHeight: number;
  indentSize: number;               // px, 默认 24
}

export const DEFAULT_SETTINGS: MindCtxSettings = {
  defaultView: 'outline',
  defaultHeadingDepth: 3,
  mindmapDirection: 'side',
  autoSaveDelay: 300,
  enableVirtualScroll: true,
  virtualScrollThreshold: 200,
  outlineFontSize: 14,
  showNotePreview: true,
  embedDefaultHeight: 400,
  indentSize: 24,
};
```

设置页面使用 Obsidian 原生 `Setting` API 实现（下拉选择、数字输入、开关）。

### 最小版设置页面（Phase 2）

Phase 2 只提供默认视图和自动保存延迟两个设置项。完整的设置页面在 Phase 5 中扩展。

```typescript
import { PluginSettingTab, Setting, App } from 'obsidian';

export class MindCtxSettingTab extends PluginSettingTab {
  plugin: MindCtxPlugin;

  constructor(app: App, plugin: MindCtxPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'MindCtx 设置' });

    new Setting(containerEl)
      .setName('默认视图')
      .setDesc('打开 MindCtx 文件时的默认视图')
      .addDropdown((drop) => {
        drop.addOption('outline', '大纲');
        drop.addOption('mindmap', '思维导图');
        drop.setValue(this.plugin.settings.defaultView);
        drop.onChange(async (value) => {
          this.plugin.settings.defaultView = value as any;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('自动保存延迟')
      .setDesc('编辑后等待多少毫秒再写入文件（100-5000）')
      .addText((text) => {
        text.setValue(String(this.plugin.settings.autoSaveDelay));
        text.onChange(async (value) => {
          const num = parseInt(value, 10);
          if (num >= 100 && num <= 5000) {
            this.plugin.settings.autoSaveDelay = num;
            await this.plugin.saveSettings();
          }
        });
      });
  }
}
```

**Phase 5 扩展说明：** Phase 5 将在此基础上添加字体大小、虚拟滚动、脑图方向等完整设置项，无需修改 `main.ts` 中的注册代码。

---

## 模块十：styles.css

### 关键样式规则

```css
/* 根容器 */
.mindctx-outline {
  font-family: var(--font-text);
  font-size: var(--mindctx-font-size, 14px);
  padding: 8px;
  height: 100%;
  overflow-y: auto;
}

/* 节点行 */
.mindctx-node {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 4px;
  border-radius: 4px;
  cursor: default;
  user-select: none;
}

.mindctx-node:hover {
  background: var(--background-modifier-hover);
}

.mindctx-node.is-selected {
  background: var(--background-modifier-active-hover);
}

/* 折叠箭头 */
.mindctx-collapse-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-faint);
  flex-shrink: 0;
}

.mindctx-collapse-btn:hover {
  color: var(--text-normal);
}

/* 拖拽手柄 */
.mindctx-drag-handle {
  width: 16px;
  height: 16px;
  opacity: 0;
  cursor: grab;
  color: var(--text-faint);
  flex-shrink: 0;
}

.mindctx-node:hover .mindctx-drag-handle {
  opacity: 1;
}

/* 标题 */
.mindctx-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Note 预览 */
.mindctx-note-preview {
  color: var(--text-faint);
  font-size: 12px;
  margin-left: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

/* 内联编辑器 */
.mindctx-inline-editor {
  background: transparent;
  border: 1px solid var(--interactive-accent);
  border-radius: 2px;
  padding: 0 4px;
  font-size: inherit;
  font-family: inherit;
  width: 100%;
  outline: none;
}

/* 拖拽指示器 */
.mindctx-drop-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--interactive-accent);
  pointer-events: none;
}

.mindctx-drop-highlight {
  background: var(--background-modifier-active-hover) !important;
}

/* 工具栏 */
.mindctx-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--background-modifier-border);
}
```

---

## esbuild.config.mjs

```javascript
import esbuild from 'esbuild';
import { existsSync } from 'fs';

const prod = process.argv[2] === 'production';

esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  format: 'cjs',
  target: 'es2022',
  outfile: 'main.js',
  sourcemap: prod ? false : 'inline',
  minify: prod,
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  define: {
    'process.env.NODE_ENV': prod ? '"production"' : '"development"',
  },
  logLevel: 'info',
}).catch(() => process.exit(1));
```

---

## 构建和测试

### package.json scripts 更新

```json
{
  "scripts": {
    "build": "node esbuild.config.mjs production",
    "dev": "node esbuild.config.mjs",
    "test": "vitest run"
  }
}
```

### 手动测试流程

1. `npm run dev` 构建插件
2. 将产出的 `main.js`, `manifest.json`, `styles.css` 复制到 Obsidian vault 的 `.obsidian/plugins/mindctx/` 目录
3. 在 Obsidian 设置中启用 MindCtx 插件
4. 创建或打开 `.mind.md` 文件
5. 验证大纲正确显示
6. 验证拖拽、键盘快捷键、编辑功能

---

## 验收标准

1. `npm run build` 无错误，产出 `main.js` < 200KB
2. 在 Obsidian 中打开 `.mind.md` 文件自动显示大纲视图
3. 大纲正确反映 Markdown 标题/列表结构
4. 可以拖拽节点改变层级和顺序
5. 拖拽后 Markdown 文件立即正确更新（debounce 300ms 后）
6. Tab/Shift+Tab 缩进/提升正常
7. Enter 创建新节点，F2/双击编辑标题
8. Ctrl+Z/Ctrl+Shift+Z 撤销/重做正常
9. 折叠/展开节点正常，状态不丢失
10. Obsidian 暗色/亮色主题下样式正确
11. 200 节点以内操作流畅（无明显卡顿）

---

## 注意事项

- Preact 的 JSX 需要 `import { h, Fragment } from 'preact'`，在 esbuild 中配置 jsxFactory
- Obsidian 的 `ItemView` 的 content area 是 `this.containerEl.children[1]`
- 不要使用 `document.querySelector` 等全局 DOM 查询，始终从 `containerEl` 出发
- 拖拽使用 HTML5 Drag and Drop API（`draggable`, `ondragstart`, `ondragover`, `ondrop`）
- 写文件前通过 `this.plugin.recentWrites` 设置时间戳，避免 `vault.on('modify')` 触发重新解析
- 所有快捷键需要检查当前焦点是否在 MindCtx 视图内，避免和 Obsidian 全局快捷键冲突
