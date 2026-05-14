# Phase 3：思维导图视图

## 前置条件

Phase 2 已完成，以下能力可用：

- 插件框架已搭建，`MindCtxView` 可以显示内容
- 大纲视图完整可用
- `MindCtxTree` AST 可正确解析和序列化
- `applyOperation` 和 `UndoManager` 可用
- `scheduleWrite` 文件回写管线可用

## 目标

1. 集成 Mind Elixir 脑图库，在 MindCtx 视图中显示思维导图
2. 实现大纲 ↔ 脑图视图一键切换
3. 脑图中的编辑操作（拖拽、编辑、增删）同步回写 Markdown
4. 视觉风格适配 Obsidian 主题

## 新增文件

```
src/
  views/
    MindMapView.tsx            # 脑图视图 Preact 组件
    components/
      ViewSwitcher.tsx         # 视图切换按钮组
  bridge/
    mindElixirBridge.ts        # Mind Elixir 数据和事件桥接
    mindElixirTheme.ts         # 主题适配
```

### 新增依赖

```json
{
  "dependencies": {
    "mind-elixir": "^4.0"
  }
}
```

---

## 模块一：mindElixirBridge.ts — 数据桥接

### 职责

1. `MindCtxTree` → Mind Elixir 数据格式（用于渲染）
2. Mind Elixir 事件 → `Operation`（用于回写）

### Mind Elixir 数据格式

```typescript
// Mind Elixir 期望的数据结构
interface MindElixirNodeData {
  id: string;
  topic: string;        // 显示文本
  children?: MindElixirNodeData[];
  direction?: number;   // 0=右, 1=左（仅根节点的一级子节点有效）
  expanded?: boolean;   // 是否展开
  // 自定义字段
  tags?: string[];
  note?: string;
}

interface MindElixirData {
  nodeData: MindElixirNodeData;
}
```

### 转换函数

```typescript
// src/bridge/mindElixirBridge.ts

import { MindCtxTree, MindCtxNode } from '../core/types';

export function treeToMindElixirData(tree: MindCtxTree, collapsedIds: Set<string>): MindElixirData {
  function convert(node: MindCtxNode, index: number, isTopLevel: boolean): MindElixirNodeData {
    const data: MindElixirNodeData = {
      id: node.id,
      topic: node.title || '(空节点)',
      expanded: !collapsedIds.has(node.id),
      tags: node.tags.length > 0 ? node.tags : undefined,
      note: node.note || undefined,
    };

    // 顶级节点分配左右方向（交替分布）
    if (isTopLevel) {
      data.direction = index % 2 === 0 ? 0 : 1;
    }

    if (node.children.length > 0) {
      data.children = node.children.map((child, i) => convert(child, i, false));
    }

    return data;
  }

  // 虚拟根节点直接作为 Mind Elixir 的中心节点
  const rootData: MindElixirNodeData = {
    id: tree.root.id,
    topic: tree.root.title || tree.filePath.replace(/.*\//, '').replace('.mind.md', ''),
    expanded: true,
    children: tree.root.children.map((child, i) => convert(child, i, true)),
  };

  return { nodeData: rootData };
}
```

### 事件桥接

```typescript
export function setupMindElixirEvents(
  instance: any,
  onOperation: (op: PartialOperation) => void,
  onCollapsedChange: (ids: Set<string>) => void,
  getCollapsedIds: () => Set<string>
): () => void {
  const handlers: Array<() => void> = [];

  // 节点拖拽移动
  const onMoveNode = (info: { node: any; oldParent: any; newParent: any; index: number }) => {
    onOperation({
      type: 'move',
      nodeId: info.node.id,
      newParentId: info.newParent.id,
      index: info.index,
    });
  };
  instance.bus.addListener('moveNode', onMoveNode);
  handlers.push(() => instance.bus.removeListener('moveNode', onMoveNode));

  // 节点标题编辑
  const onEditNode = (info: { node: any; oldTopic: string }) => {
    if (info.node.topic !== info.oldTopic) {
      onOperation({
        type: 'rename',
        nodeId: info.node.id,
        newTitle: info.node.topic,
      });
    }
  };
  instance.bus.addListener('finishEdit', onEditNode);
  handlers.push(() => instance.bus.removeListener('finishEdit', onEditNode));

  // 添加子节点
  const onAddChild = (info: { parent: any; node: any }) => {
    onOperation({
      type: 'create',
      parentId: info.parent.id,
      index: -1,  // 追加到末尾
      title: info.node.topic || '新节点',
    });
  };
  instance.bus.addListener('addChild', onAddChild);
  handlers.push(() => instance.bus.removeListener('addChild', onAddChild));

  // 添加兄弟节点
  const onAddSibling = (info: { node: any; siblingNode: any }) => {
    onOperation({
      type: 'create',
      parentId: info.node.parent?.id || '',
      index: -1,
      title: info.siblingNode.topic || '新节点',
    });
  };
  instance.bus.addListener('addSibling', onAddSibling);
  handlers.push(() => instance.bus.removeListener('addSibling', onAddSibling));

  // 删除节点
  const onRemoveNode = (info: { node: any }) => {
    onOperation({ type: 'delete', nodeId: info.node.id });
  };
  instance.bus.addListener('removeNode', onRemoveNode);
  handlers.push(() => instance.bus.removeListener('removeNode', onRemoveNode));

  // 折叠/展开同步到 MindCtxView
  const onExpandNode = (info: { node: any }) => {
    const newCollapsed = new Set(getCollapsedIds());
    newCollapsed.delete(info.node.id);
    onCollapsedChange(newCollapsed);
  };
  instance.bus.addListener('expandNode', onExpandNode);
  handlers.push(() => instance.bus.removeListener('expandNode', onExpandNode));

  const onCollapseNode = (info: { node: any }) => {
    const newCollapsed = new Set(getCollapsedIds());
    newCollapsed.add(info.node.id);
    onCollapsedChange(newCollapsed);
  };
  instance.bus.addListener('collapseNode', onCollapseNode);
  handlers.push(() => instance.bus.removeListener('collapseNode', onCollapseNode));

  // 返回清理函数
  return () => handlers.forEach(h => h());
}
```

**重要说明：**
- Mind Elixir v4 的事件名可能因版本不同而异。实现时以实际安装版本的 README/源码为准。
- 如果实际 API 使用统一的 `operation` 事件（如实施设计文档所述），需要适配为 `switch(operation.name)` 模式。
- `onCollapsedChange` 需要获取当前 collapsedIds 的引用，通过 `getCollapsedIds` 回调参数传入（闭包绑定调用方的 signal `.value`）。

---

## 模块二：mindElixirTheme.ts — 主题适配

### 职责

从 Obsidian CSS 变量生成 Mind Elixir 主题配置。

```typescript
// src/bridge/mindElixirTheme.ts

export function getObsidianTheme(containerEl: HTMLElement): Record<string, string> {
  const style = getComputedStyle(containerEl);

  return {
    '--main-color': style.getPropertyValue('--text-normal').trim(),
    '--main-bgcolor': style.getPropertyValue('--background-primary').trim(),
    '--color': style.getPropertyValue('--text-normal').trim(),
    '--bgcolor': style.getPropertyValue('--background-secondary').trim(),
    '--selected': style.getPropertyValue('--interactive-accent').trim(),
    '--root-color': style.getPropertyValue('--text-on-accent').trim(),
    '--root-bgcolor': style.getPropertyValue('--interactive-accent').trim(),
    '--line-color': style.getPropertyValue('--text-faint').trim(),
  };
}

export function applyTheme(container: HTMLElement, theme: Record<string, string>) {
  for (const [key, value] of Object.entries(theme)) {
    container.style.setProperty(key, value);
  }
}
```

---

## 模块三：MindMapView.tsx — 脑图视图组件

### 组件结构

```typescript
// src/views/MindMapView.tsx

import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import MindElixir from 'mind-elixir';
import { treeToMindElixirData, setupMindElixirEvents } from '../bridge/mindElixirBridge';
import { getObsidianTheme, applyTheme } from '../bridge/mindElixirTheme';

interface MindMapViewProps {
  tree: MindCtxTree | null;          // 由父组件从 signal 解包后传入普通值
  collapsedIds: Set<string>;         // 同上，从 signal 解包
  onOperation: (op: PartialOperation) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCollapsedChange: (ids: Set<string>) => void;
}
```

**说明**：MindMapView 接收普通值（非 Signal），由父组件 `MindCtxRoot` 从 signals 中取值后传入。这是因为 Mind Elixir 是命令式 API，需要通过 `useEffect` 的依赖数组感知变化来触发 `refresh()`，signals 的自动订阅机制在此场景不适用。

```typescript

export function MindMapView({ tree, collapsedIds, onOperation, onUndo, onRedo, onCollapsedChange }: MindMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);  // Mind Elixir instance
  const cleanupRef = useRef<(() => void) | null>(null);
  const isInternalUpdate = useRef(false); // 防止事件循环：Mind Elixir 操作 → tree 更新 → refresh → 再次触发事件
  const collapsedIdsRef = useRef(collapsedIds); // 保持最新引用，供事件闭包读取
  const treeIdRef = useRef<string | null>(null); // 跟踪文件切换

  // 同步 collapsedIds 到 ref
  collapsedIdsRef.current = collapsedIds;

  // 包装 onOperation，设置 isInternalUpdate 标志
  const wrappedOnOperation = (op: PartialOperation) => {
    isInternalUpdate.current = true;
    onOperation(op);
    // 使用 microtask 确保 tree 更新后再重置标志
    queueMicrotask(() => { isInternalUpdate.current = false; });
  };

  // 初始化和销毁 Mind Elixir
  // 使用 tree.filePath 作为依赖，确保切换文件时重新创建实例
  useEffect(() => {
    if (!containerRef.current || !tree) return;

    // 文件切换检测：filePath 变化时需要重新初始化
    const currentTreeId = tree.filePath;
    if (instanceRef.current && treeIdRef.current === currentTreeId) return;
    
    // 清理旧实例
    if (instanceRef.current) {
      cleanupRef.current?.();
      if (instanceRef.current.destroy) instanceRef.current.destroy();
      instanceRef.current = null;
    }
    treeIdRef.current = currentTreeId;

    // 初始化 Mind Elixir
    const me = new MindElixir({
      el: containerRef.current,
      direction: MindElixir.SIDE,
      draggable: true,
      contextMenu: false,
      toolBar: false,
      nodeMenu: false,
      keypress: false,          // 禁用内置快捷键，统一由 MindCtx 处理以保证操作经过 UndoManager
      locale: 'zh_CN',
    });

    // 应用主题
    applyTheme(containerRef.current, getObsidianTheme(containerRef.current));

    // 监听 Obsidian 主题切换（暗色/亮色）
    const themeObserver = new MutationObserver(() => {
      if (containerRef.current) {
        applyTheme(containerRef.current, getObsidianTheme(containerRef.current));
      }
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // 加载数据
    const data = treeToMindElixirData(tree, collapsedIds);
    me.init(data);

    // 桥接事件（使用 wrappedOnOperation 防止事件循环，使用 collapsedIdsRef 确保读取最新值）
    cleanupRef.current = setupMindElixirEvents(me, wrappedOnOperation, onCollapsedChange, () => collapsedIdsRef.current);
    instanceRef.current = me;

    return () => {
      cleanupRef.current?.();
      themeObserver.disconnect();
      // 销毁 Mind Elixir 实例
      if (me.destroy) me.destroy();
      instanceRef.current = null;
      treeIdRef.current = null;
    };
  }, [tree?.filePath]);  // 依赖 filePath，确保文件切换时重新初始化

  // tree 变化时更新数据（仅当变化来自外部时 refresh，来自脑图自身操作时跳过）
  useEffect(() => {
    if (!instanceRef.current || !tree) return;
    // 如果是脑图自身操作触发的 tree 更新，跳过 refresh（Mind Elixir 已自行更新 UI）
    if (isInternalUpdate.current) return;
    const data = treeToMindElixirData(tree, collapsedIds);
    instanceRef.current.refresh(data);
  }, [tree, collapsedIds]);

  // 键盘事件：脑图视图中的快捷键
  // 由于 keypress: false 禁用了 Mind Elixir 内置快捷键，需要自行实现
  const handleKeyDown = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const me = instanceRef.current;
    if (!me) return;

    // 获取当前选中节点
    const selectedNode = me.currentNode;

    if (mod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      onUndo();
    } else if (mod && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      onRedo();
    } else if (e.key === 'Tab' && selectedNode) {
      // Tab: 添加子节点
      e.preventDefault();
      onOperation({
        type: 'create',
        parentId: selectedNode.id,
        index: -1,
        title: '新节点',
      });
    } else if (e.key === 'Enter' && selectedNode) {
      // Enter: 添加兄弟节点（如果非根节点）
      e.preventDefault();
      if (selectedNode.parent) {
        onOperation({
          type: 'create',
          parentId: selectedNode.parent.id,
          index: -1,
          title: '新节点',
        });
      }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode) {
      // Delete/Backspace: 删除选中节点（非根节点）
      e.preventDefault();
      if (selectedNode.parent) {
        onOperation({ type: 'delete', nodeId: selectedNode.id });
      }
    } else if (e.key === 'F2' && selectedNode) {
      // F2: 编辑节点标题
      e.preventDefault();
      me.beginEdit(selectedNode);
    }
  };

  return (
    <div
      ref={containerRef}
      class="mindctx-mindmap-container"
      style={{ width: '100%', height: '100%' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    />
  );
}
```

### 刷新策略

Mind Elixir 的 `refresh` 方法会重新渲染整个脑图。为了避免频繁刷新导致闪烁：

- 用户在脑图中编辑（拖拽、改名）→ 不触发 refresh（Mind Elixir 自己处理了 UI 更新）
- 用户在大纲中编辑后切换到脑图 → 触发 refresh
- 外部文件修改 → 触发 refresh

实现方式：使用 `isInternalUpdate` ref 标志位。脑图自身操作通过 `wrappedOnOperation` 触发时设置标志为 `true`，在 tree 更新的 useEffect 中检查此标志，为 `true` 时跳过 refresh。标志通过 `queueMicrotask` 在本轮微任务结束后自动重置为 `false`。

---

## 模块四：ViewSwitcher.tsx — 视图切换

### 组件

```typescript
// src/views/components/ViewSwitcher.tsx

interface ViewSwitcherProps {
  currentView: 'outline' | 'mindmap';
  onSwitch: (view: 'outline' | 'mindmap') => void;
}

export function ViewSwitcher({ currentView, onSwitch }: ViewSwitcherProps) {
  return (
    <div class="mindctx-view-switcher">
      <button
        class={`mindctx-switch-btn ${currentView === 'outline' ? 'is-active' : ''}`}
        onClick={() => onSwitch('outline')}
        title="大纲视图"
      >
        大纲
      </button>
      <button
        class={`mindctx-switch-btn ${currentView === 'mindmap' ? 'is-active' : ''}`}
        onClick={() => onSwitch('mindmap')}
        title="思维导图"
      >
        脑图
      </button>
    </div>
  );
}
```

### 样式

```css
.mindctx-view-switcher {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--background-modifier-border);
  border-radius: 6px;
}

.mindctx-switch-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
}

.mindctx-switch-btn.is-active {
  background: var(--background-primary);
  color: var(--text-normal);
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}
```

---

## 模块五：MindCtxView.ts 更新

### 新增视图切换逻辑

Phase 2 建立了 signals 驱动的渲染模式（Preact 只挂载一次，后续通过 signals 驱动更新），且已使用 `MindCtxRoot` 包装组件。Phase 3 沿用此模式：新增一个 `currentViewSignal` 控制视图切换，在 `MindCtxRoot` 中通过 signal 值条件渲染大纲或脑图。

```typescript
// 在 MindCtxView 类中添加：

// 新增 signal（与 Phase 2 的其他 signals 同级）
currentViewSignal = signal<'outline' | 'mindmap'>('outline');

switchView(view: 'outline' | 'mindmap') {
  this.currentViewSignal.value = view;
}

// renderView() 保持 Phase 2 的模式不变（已使用 MindCtxRoot），仅需为 MindCtxRoot 增加新 props
renderView() {
  const container = this.containerEl.children[1];
  if (!this.preactMounted) {
    render(
      <MindCtxRoot
        treeSignal={this.treeSignal}
        collapsedIds={this.collapsedIds}
        selectedNodeId={this.selectedNodeId}
        editingNodeId={this.editingNodeId}
        currentView={this.currentViewSignal}
        onOperation={(op) => this.executeOperation(op)}
        onUndo={() => this.undo()}
        onRedo={() => this.redo()}
        onSwitchView={(v) => this.switchView(v)}
        onCollapsedChange={(ids) => { this.collapsedIds.value = ids; }}
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
```

### MindCtxRoot 组件（Phase 3 替换 Phase 2 版本）

Phase 3 扩展 `MindCtxRoot`，在 Phase 2 的 `OutlineToolbar + OutlineView` 基础上新增视图切换和脑图视图。同时需要修改 `OutlineToolbar` 组件，添加 `ViewSwitcher` 渲染位置（传入 `currentView` 和 `onSwitchView` props）。

```typescript
// 根组件：根据 currentView signal 条件渲染
function MindCtxRoot(props) {
  const tree = props.treeSignal.value;
  const view = props.currentView.value;

  return (
    <div class="mindctx-container">
      <OutlineToolbar
        currentView={view}
        onSwitchView={props.onSwitchView}
        onExpandAll={props.onExpandAll}
        onCollapseAll={props.onCollapseAll}
      />
      {view === 'outline' ? (
        <OutlineView {...props} />
      ) : tree ? (
        <MindMapView
          tree={tree}
          collapsedIds={props.collapsedIds.value}
          onOperation={props.onOperation}
          onUndo={props.onUndo}
          onRedo={props.onRedo}
          onCollapsedChange={props.onCollapsedChange}
        />
      ) : (
        <div class="mindctx-loading">加载中...</div>
      )}
    </div>
  );
}
```

### 设计说明

- **不使用 `container.empty()` + 重新 render**：这会销毁整个 Preact 组件树，丢失组件内部状态
- 切换视图通过修改 `currentViewSignal` 的值触发 Preact 条件渲染
- 切回大纲时，大纲组件状态（选中节点、滚动位置等）可通过 signals 保留
- 切换到脑图时，Mind Elixir 实例在组件 mount 时创建，unmount 时销毁

### OutlineToolbar 修改（Phase 3 对 Phase 2 文件的修改）

Phase 2 中 `OutlineToolbar` 只有 `onExpandAll` / `onCollapseAll` 两个 props。Phase 3 需要修改该组件，添加视图切换相关 props：

```typescript
// src/views/components/OutlineToolbar.tsx — Phase 3 修改版

interface OutlineToolbarProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  // Phase 3 新增：
  currentView?: 'outline' | 'mindmap';
  onSwitchView?: (view: 'outline' | 'mindmap') => void;
}

export function OutlineToolbar({ onExpandAll, onCollapseAll, currentView, onSwitchView }: OutlineToolbarProps) {
  return (
    <div class="mindctx-toolbar">
      <button class="mindctx-toolbar-btn" onClick={onExpandAll} title="展开全部">展开全部</button>
      <button class="mindctx-toolbar-btn" onClick={onCollapseAll} title="折叠全部">折叠全部</button>
      <div style={{ flex: 1 }} />
      {currentView && onSwitchView && (
        <ViewSwitcher currentView={currentView} onSwitch={onSwitchView} />
      )}
    </div>
  );
}
```

新增的 `currentView` 和 `onSwitchView` 均为可选参数，保证 Phase 2 的使用方式不需要改动（如嵌入块场景下不传视图切换 props）。

### 视图切换时的数据一致性

切换视图时不需要重新解析文件，因为两个视图共享同一个 `MindCtxTree` AST（通过 `treeSignal`）。切换只是 signal 值变化触发条件渲染。

### 注册 toggle-view 命令

在 `main.ts` 的 `onload()` 中注册视图切换命令：

```typescript
this.addCommand({
  id: 'toggle-view',
  name: '切换视图（大纲 ↔ 脑图）',
  checkCallback: (checking) => {
    const view = this.getActiveMindCtxView();
    if (!view) return false;
    if (checking) return true;
    view.switchView(view.currentViewSignal.value === 'outline' ? 'mindmap' : 'outline');
  },
});
```

---

## 模块六：Mind Elixir 脑图样式定制

### 额外 CSS

```css
/* 脑图容器 */
.mindctx-mindmap-container {
  background: var(--background-primary);
}

/* 覆盖 Mind Elixir 默认样式 */
.mindctx-mindmap-container .mind-elixir-node {
  font-family: var(--font-text);
  font-size: 14px;
}

.mindctx-mindmap-container .mind-elixir-root {
  font-size: 18px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
}

.mindctx-mindmap-container .mind-elixir-node .node-content {
  padding: 4px 10px;
  border-radius: 4px;
}

/* 选中状态 */
.mindctx-mindmap-container .mind-elixir-node.selected .node-content {
  outline: 2px solid var(--interactive-accent);
}

/* 连接线 */
.mindctx-mindmap-container svg path {
  stroke: var(--text-faint);
  stroke-width: 2;
}
```

---

## Mind Elixir 事件完整列表

需要处理的 Mind Elixir 事件：

| 事件名 | 触发时机 | 映射操作 |
|--------|----------|----------|
| `selectNode` | 点击节点 | 更新选中状态（UI only） |
| `finishEdit` | 编辑节点完成 | rename |
| `moveNode` | 拖拽节点完成 | move |
| `addChild` | 添加子节点 | create |
| `addSibling` | 添加兄弟节点 | create |
| `removeNode` | 删除节点 | delete |
| `expandNode` | 展开节点 | 更新 collapsedIds |
| `collapseNode` | 折叠节点 | 更新 collapsedIds |

**不需要处理的事件：** `operation`（太底层）、`reshapeNode`（我们不保存坐标）

---

## 注意事项

1. **Mind Elixir 版本**：使用 v4.x，API 可能与 v3 不同，以 npm 安装的版本为准
2. **内存管理**：切换到大纲视图时，销毁 Mind Elixir 实例（调用 `me.destroy()` 如果有的话，否则移除 DOM 即可）
3. **性能**：超过 500 个节点时脑图可能卡顿，考虑只渲染前 N 层（通过 `maxDepth` 配置）
4. **防止事件循环**：Mind Elixir 操作 → onOperation → tree 更新 → refresh → 不要再触发 Mind Elixir 事件。已通过 `isInternalUpdate` ref 标志位实现：`wrappedOnOperation` 设置标志为 true，tree 变化的 useEffect 中检查该标志，为 true 时跳过 refresh，标志通过 `queueMicrotask` 自动重置
5. **Mind Elixir 如果不支持某些事件名**：需要查阅实际安装版本的 README 和源码，适配真实 API
6. **脑图中的键盘快捷键**：由于 `keypress: false` 禁用了 Mind Elixir 内置快捷键，MindMapView 组件通过 `handleKeyDown` 自行实现 Tab（添加子节点）、Enter（添加兄弟节点）、Delete（删除节点）、F2（编辑标题）、Ctrl+Z/Ctrl+Shift+Z（Undo/Redo）。键盘操作使用原始 `onOperation`（非 `wrappedOnOperation`），因为这些操作不是 Mind Elixir 发起的，树更新后需要 refresh 才能在脑图中体现变化。
7. **文件切换处理**：MindMapView 通过 `tree.filePath` 检测文件切换，filePath 变化时销毁旧实例并重新创建。同一文件内的 tree 引用变化（编辑操作导致）不会触发重建。
8. **闭包陷阱**：事件桥接中的 `getCollapsedIds` 通过 `useRef` 保持引用最新，避免闭包捕获初始值的问题。

---

## 验收标准

1. 点击"脑图"按钮切换到思维导图视图
2. 脑图正确显示所有节点（标题和层级结构）
3. 脑图中拖拽节点后，切回大纲视图结构正确
4. 脑图中拖拽后 Markdown 文件正确更新
5. 脑图中双击编辑节点标题后文件正确更新
6. 脑图中 Tab 添加子节点、Enter 添加兄弟节点正常
7. 脑图中 Delete 删除节点正常
8. 视图来回切换无数据丢失
9. Obsidian 暗色/亮色主题下脑图颜色协调
10. 200 节点的脑图渲染流畅
