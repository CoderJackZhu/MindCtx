# Phase 5：打磨、性能优化与发布准备

## 前置条件

Phase 4 已完成，插件核心功能完整：
- 大纲视图 + 脑图视图
- 嵌入块
- 导入导出
- 所有编辑操作和 Undo/Redo

## 目标

1. 搜索/筛选功能
2. 大文件性能优化（虚拟滚动）
3. 右键上下文菜单
4. 插件设置页面
5. 文件菜单集成
6. 确认前序 Phase 命令注册完整（toggle-view 已在 Phase 3，expand-all/collapse-all 已在 Phase 2）
7. 实现 DetailPanel（节点详情面板，显示 note + blocks）
8. 实现折叠状态持久化
9. 全面的边界情况修复
10. 发布准备（README、版本号等）

## 新增文件

```
src/
  state.ts                     # 折叠状态持久化（state.json 读写）
  views/
    components/
      SearchBar.tsx             # 搜索筛选组件
      DetailPanel.tsx           # 节点详情面板（note + blocks）
```

---

## 模块一：搜索与筛选

### 功能描述

在大纲视图顶部提供搜索框，输入关键词实时筛选节点。

### 行为规范

- 搜索框快捷键：`Ctrl/Cmd+F`（焦点在 MindCtx 视图内时）
- 输入文字后实时筛选（debounce 150ms）
- 匹配规则：节点 title 包含关键词（不区分大小写）
- 显示逻辑：匹配的节点及其所有祖先节点显示，其他隐藏
- 匹配高亮：关键词在 title 中高亮显示（黄色背景）
- 清空搜索：按 Escape 或点击清除按钮
- 脑图视图中：搜索后聚焦到第一个匹配节点（scrollIntoView）

### 实现

```typescript
// 筛选算法
function filterTree(root: MindCtxNode, query: string): Set<string> {
  // 返回需要显示的节点 ID 集合
  const visibleIds = new Set<string>();
  const lowerQuery = query.toLowerCase();

  function walk(node: MindCtxNode, ancestors: string[]): boolean {
    const matches = node.title.toLowerCase().includes(lowerQuery);
    let hasMatchingDescendant = false;

    for (const child of node.children) {
      if (walk(child, [...ancestors, node.id])) {
        hasMatchingDescendant = true;
      }
    }

    if (matches || hasMatchingDescendant) {
      visibleIds.add(node.id);
      ancestors.forEach(id => visibleIds.add(id));
      return true;
    }

    return false;
  }

  walk(root, []);
  return visibleIds;
}
```

### SearchBar 组件

```typescript
interface SearchBarProps {
  value: string;
  onChange: (query: string) => void;
  onClose: () => void;
  matchCount: number;
}
```

---

## 模块二：虚拟滚动

### 触发条件

当可见节点数量 > 200 时自动启用虚拟滚动。

### 实现方案

使用简单的固定高度虚拟滚动（每个节点行高 32px）：

```typescript
interface VirtualScrollState {
  scrollTop: number;
  containerHeight: number;
  totalHeight: number;       // visibleNodes.length * 32
  startIndex: number;        // 第一个渲染的节点索引
  endIndex: number;          // 最后一个渲染的节点索引
  overscan: number;          // 上下多渲染的缓冲行数，默认 10
}

function calculateVisibleRange(
  scrollTop: number,
  containerHeight: number,
  totalCount: number,
  rowHeight: number,
  overscan: number
): { start: number; end: number } {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(totalCount, Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan);
  return { start, end };
}
```

### 渲染结构

```tsx
function VirtualOutlineTree({ nodes, rowHeight, containerHeight }) {
  const [scrollTop, setScrollTop] = useState(0);
  const totalHeight = nodes.length * rowHeight;
  const { start, end } = calculateVisibleRange(scrollTop, containerHeight, nodes.length, rowHeight, 10);

  return (
    <div
      class="mindctx-scroll-container"
      style={{ height: containerHeight, overflow: 'auto' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {nodes.slice(start, end).map((node, i) => (
          <div
            key={node.id}
            style={{ position: 'absolute', top: (start + i) * rowHeight, height: rowHeight, width: '100%' }}
          >
            <OutlineNode node={node} ... />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 注意事项

- 虚拟滚动和拖拽交互需要兼容：拖拽到容器边缘时自动滚动
- 搜索筛选后重新计算虚拟滚动参数
- 折叠/展开后重新计算可见节点列表

### 拖拽时自动滚动

当拖拽节点到容器边缘时，需要自动滚动以便用户可以将节点拖到可视区域外的位置：

```typescript
const AUTO_SCROLL_THRESHOLD = 40; // px，距边缘小于此值时触发
const AUTO_SCROLL_SPEED = 8;      // px/frame

function handleDragOverWithAutoScroll(e: DragEvent, scrollContainer: HTMLElement) {
  const rect = scrollContainer.getBoundingClientRect();
  const y = e.clientY;
  
  if (y - rect.top < AUTO_SCROLL_THRESHOLD) {
    scrollContainer.scrollTop -= AUTO_SCROLL_SPEED;
  } else if (rect.bottom - y < AUTO_SCROLL_THRESHOLD) {
    scrollContainer.scrollTop += AUTO_SCROLL_SPEED;
  }
}
```

在 `VirtualOutlineTree` 的 `onDragOver` 中调用此函数即可。

---

## 模块三：右键上下文菜单

### 触发方式

右键点击节点行时弹出上下文菜单。

### 使用 Obsidian Menu API

```typescript
import { Menu } from 'obsidian';
import { findParent, findIndex } from '../core/operations';
import { serializeSubtree } from '../core/serializer';
import type { MindCtxNode, MindCtxTree, PartialOperation } from '../core/types';

function showNodeContextMenu(
  event: MouseEvent,
  node: MindCtxNode,
  tree: MindCtxTree,
  onOperation: (op: PartialOperation) => void
) {
  const menu = new Menu();

  menu.addItem((item) => {
    item.setTitle('编辑标题')
      .setIcon('pencil')
      .onClick(() => startEditing(node.id));
  });

  menu.addSeparator();

  menu.addItem((item) => {
    item.setTitle('添加子节点')
      .setIcon('plus')
      .onClick(() => onOperation({ type: 'create', parentId: node.id, index: -1, title: '新节点' }));
  });

  menu.addItem((item) => {
    item.setTitle('添加兄弟节点')
      .setIcon('plus-circle')
      .onClick(() => {
        const parent = findParent(tree.root, node.id);
        if (!parent) return;
        const idx = findIndex(parent, node.id);
        onOperation({ type: 'create', parentId: parent.id, index: idx + 1, title: '新节点' });
      });
  });

  menu.addSeparator();

  menu.addItem((item) => {
    item.setTitle('缩进')
      .setIcon('indent')
      .onClick(() => onOperation({ type: 'indent', nodeId: node.id }));
  });

  menu.addItem((item) => {
    item.setTitle('提升')
      .setIcon('outdent')
      .onClick(() => onOperation({ type: 'outdent', nodeId: node.id }));
  });

  menu.addSeparator();

  menu.addItem((item) => {
    item.setTitle('上移')
      .setIcon('arrow-up')
      .onClick(() => onOperation({ type: 'moveUp', nodeId: node.id }));
  });

  menu.addItem((item) => {
    item.setTitle('下移')
      .setIcon('arrow-down')
      .onClick(() => onOperation({ type: 'moveDown', nodeId: node.id }));
  });

  menu.addSeparator();

  menu.addItem((item) => {
    item.setTitle('删除')
      .setIcon('trash')
      .onClick(() => onOperation({ type: 'delete', nodeId: node.id }));
  });

  menu.addSeparator();

  menu.addItem((item) => {
    item.setTitle('复制为 Markdown')
      .setIcon('copy')
      .onClick(() => {
        const subtreeMarkdown = serializeSubtree(node, tree.headingDepth);
        navigator.clipboard.writeText(subtreeMarkdown);
        new Notice('已复制');
      });
  });

  menu.showAtMouseEvent(event);
}
```

---

## 模块四：设置页面（替换 Phase 2 精简版）

Phase 2 实现了仅包含"默认视图"和"自动保存延迟"两项的精简设置页。本阶段用以下完整版替换 Phase 2 中 `settings.ts` 的 `MindCtxSettingTab.display()` 方法，无需修改 `main.ts` 中的注册代码。

### 使用 Obsidian Setting API

```typescript
import { PluginSettingTab, Setting } from 'obsidian';

export class MindCtxSettingTab extends PluginSettingTab {
  plugin: MindCtxPlugin;

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
      .setName('默认标题深度')
      .setDesc('标题最大层级（超过后转为列表项），1-6')
      .addSlider((slider) => {
        slider.setLimits(1, 6, 1);
        slider.setValue(this.plugin.settings.defaultHeadingDepth);
        slider.setDynamicTooltip();
        slider.onChange(async (value) => {
          this.plugin.settings.defaultHeadingDepth = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('自动保存延迟')
      .setDesc('编辑后等待多少毫秒再写入文件')
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

    new Setting(containerEl)
      .setName('大纲字体大小')
      .setDesc('大纲视图的字体大小（px）')
      .addSlider((slider) => {
        slider.setLimits(12, 20, 1);
        slider.setValue(this.plugin.settings.outlineFontSize);
        slider.setDynamicTooltip();
        slider.onChange(async (value) => {
          this.plugin.settings.outlineFontSize = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('显示备注预览')
      .setDesc('在大纲节点旁显示 note 的首行预览')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showNotePreview);
        toggle.onChange(async (value) => {
          this.plugin.settings.showNotePreview = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('脑图方向')
      .setDesc('思维导图的展开方向')
      .addDropdown((drop) => {
        drop.addOption('side', '左右展开');
        drop.addOption('right', '仅向右');
        drop.addOption('left', '仅向左');
        drop.setValue(this.plugin.settings.mindmapDirection || 'side');
        drop.onChange(async (value) => {
          this.plugin.settings.mindmapDirection = value as any;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('虚拟滚动')
      .setDesc('节点数超过阈值时自动启用虚拟滚动以提升性能')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enableVirtualScroll);
        toggle.onChange(async (value) => {
          this.plugin.settings.enableVirtualScroll = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('虚拟滚动阈值')
      .setDesc('可见节点数超过此值时启用虚拟滚动')
      .addText((text) => {
        text.setValue(String(this.plugin.settings.virtualScrollThreshold));
        text.onChange(async (value) => {
          const num = parseInt(value, 10);
          if (num >= 50 && num <= 1000) {
            this.plugin.settings.virtualScrollThreshold = num;
            await this.plugin.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName('嵌入块默认高度')
      .setDesc('嵌入块的默认显示高度（px）')
      .addText((text) => {
        text.setValue(String(this.plugin.settings.embedDefaultHeight));
        text.onChange(async (value) => {
          const num = parseInt(value, 10);
          if (num >= 200 && num <= 1000) {
            this.plugin.settings.embedDefaultHeight = num;
            await this.plugin.saveSettings();
          }
        });
      });
  }
}
```

---

## 模块五：文件菜单集成

### 右键文件时的额外菜单项

```typescript
// 在 main.ts onload() 中
this.registerEvent(
  this.app.workspace.on('file-menu', (menu, file) => {
    if (file instanceof TFile && file.path.endsWith('.md')) {
      menu.addItem((item) => {
        item.setTitle('以 MindCtx 打开')
          .setIcon('list-tree')
          .onClick(() => this.activateMindCtxView(file));
      });
    }

    if (file instanceof TFile && this.isMindCtxFile(file)) {
      menu.addItem((item) => {
        item.setTitle('导出为 OPML')
          .setIcon('download')
          .onClick(async () => {
            const content = await this.app.vault.read(file);
            const tree = parse(content, { filePath: file.path });
            const opml = exportOPML(tree);
            await this.saveExportFile(opml, file.basename + '.opml', file);
          });
      });
    }
  })
);
```

---

## 模块六：补充命令注册说明

以下命令已在前序阶段注册，此处仅供确认：

- `toggle-view` → Phase 3 中注册（视图切换）
- `expand-all` / `collapse-all` → Phase 2 中注册（大纲展开/折叠）

如发现遗漏，在本阶段补充注册。

---

## 模块七：DetailPanel（节点详情面板）

### 功能描述

选中节点后在大纲下方或右侧显示详情面板，展示和编辑该节点的 `note` 和 `blocks` 内容。

```typescript
interface DetailPanelProps {
  node: MindCtxNode | null;
  onUpdateNote: (nodeId: string, newNote: string) => void;
}

function DetailPanel({ node, onUpdateNote }: DetailPanelProps) {
  if (!node) return null;

  const [localNote, setLocalNote] = useState(node.note);

  // 当选中节点变化时，同步本地状态
  useEffect(() => {
    setLocalNote(node.note);
  }, [node.id, node.note]);

  return (
    <div class="mindctx-detail-panel">
      <div class="mindctx-detail-note">
        <textarea
          value={localNote}
          placeholder="添加备注..."
          onInput={(e) => setLocalNote(e.currentTarget.value)}
          onBlur={(e) => {
            if (e.currentTarget.value !== node.note) {
              onUpdateNote(node.id, e.currentTarget.value);
            }
          }}
        />
      </div>
      {node.blocks.length > 0 && (
        <div class="mindctx-detail-blocks">
          {node.blocks.map((block, i) => (
            <pre key={i} class={`mindctx-block mindctx-block-${block.type}`}>
              <code>{block.raw}</code>
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 样式

```css
.mindctx-detail-panel {
  border-top: 1px solid var(--background-modifier-border);
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.mindctx-detail-note textarea {
  width: 100%;
  min-height: 60px;
  border: none;
  background: var(--background-secondary);
  border-radius: 4px;
  padding: 8px;
  font-family: var(--font-text);
  font-size: 13px;
  resize: vertical;
}

.mindctx-detail-blocks pre {
  background: var(--background-secondary);
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  margin: 4px 0;
}
```

---

## 模块八：折叠状态持久化

### 实现

```typescript
// src/state.ts

interface PluginState {
  collapsedNodes: {
    [filePath: string]: string[];
  };
}

const STATE_FILE = 'state.json';

export async function loadState(plugin: MindCtxPlugin): Promise<PluginState> {
  const path = `${plugin.manifest.dir}/${STATE_FILE}`;
  try {
    const data = await plugin.app.vault.adapter.read(path);
    return JSON.parse(data);
  } catch {
    return { collapsedNodes: {} };
  }
}

export async function saveState(plugin: MindCtxPlugin, state: PluginState): Promise<void> {
  const path = `${plugin.manifest.dir}/${STATE_FILE}`;
  await plugin.app.vault.adapter.write(path, JSON.stringify(state, null, 2));
}
```

在 `MindCtxView.onOpen()` 中加载折叠状态，在 `onClose()` 中保存。

---

## 模块九：serializeSubtree 使用说明

`serializeSubtree` 已在 Phase 1 的 `serializer.ts` 中完整实现。右键菜单的"复制为 Markdown"直接调用即可：

```typescript
import { serializeSubtree } from '../core/serializer';

// 右键菜单中的使用方式：
const subtreeMarkdown = serializeSubtree(node, tree.headingDepth);
navigator.clipboard.writeText(subtreeMarkdown);
```

---

## 模块十：边界情况测试与修复

逐项检查并修复：

| # | 场景 | 预期行为 |
|---|------|----------|
| 1 | 打开空的 .mind.md 文件 | 显示空大纲，可直接创建第一个节点 |
| 2 | 文件被外部删除 | 视图显示"文件已删除"，不 crash |
| 3 | 文件被外部重命名 | 视图自动更新标题 |
| 4 | 超长节点标题（1000+ 字符） | 截断显示，不影响布局 |
| 5 | 节点标题包含特殊 Markdown 字符 | `# *bold*` 正确处理为标题文本 |
| 6 | 连续快速操作（高频拖拽） | debounce 保证不会文件写入竞争 |
| 7 | frontmatter 含非 ASCII 字符 | YAML 正确解析 |
| 8 | .mind.md 文件无 frontmatter | 正常解析，使用默认设置 |
| 9 | 嵌入块引用不存在的文件 | 友好错误提示 |
| 10 | 嵌入块引用的文件被删除 | 下次渲染显示错误 |
| 11 | 同一文件同时在多个视图打开 | 编辑一个视图，另一个自动刷新 |
| 12 | 脑图中 500+ 节点 | 不卡死，可以操作（可能慢） |
| 13 | 纯列表文件（无标题） | 正确显示所有列表项 |
| 14 | 标题跳级后拖拽 | 正确处理 heading level 重新计算 |
| 15 | Undo 到初始状态后继续 Undo | 不 crash，canUndo()=false |

---

## 模块十一：发布准备

### manifest.json 最终版

```json
{
  "id": "mindctx",
  "name": "MindCtx",
  "version": "1.0.0",
  "minAppVersion": "1.4.0",
  "description": "Markdown-first structured outline editor with mind map view. Write Markdown, see outlines, switch to mind maps.",
  "author": "MindCtx",
  "authorUrl": "https://github.com/mindctx",
  "isDesktopOnly": false
}
```

### versions.json

```json
{
  "1.0.0": "1.4.0"
}
```

### 最终构建检查

```bash
# 1. 清理构建
rm -rf dist main.js

# 2. TypeScript 类型检查
npx tsc --noEmit

# 3. 运行测试
npm test

# 4. 生产构建
npm run build

# 5. 检查产出物大小
ls -la main.js   # 应 < 300KB
wc -l styles.css  # 应 < 500 行

# 6. 确认无 console.log 残留
grep -r "console.log" src/ --include="*.ts" --include="*.tsx"
```

### 手动验收测试清单

```
[ ] 新建 .mind.md 文件
[ ] 打开后自动显示大纲
[ ] 大纲拖拽正常
[ ] 键盘快捷键全部正常
[ ] 切换到脑图视图
[ ] 脑图拖拽后文件正确更新
[ ] 切换回大纲，结构一致
[ ] Ctrl+Z 撤销正常
[ ] 搜索筛选正常
[ ] 右键菜单正常
[ ] 嵌入块在阅读模式正确渲染
[ ] 嵌入块视图切换正常
[ ] 导入 OPML 正常
[ ] 导入 FreeMind .mm 正常
[ ] 导出 OPML 正常
[ ] 导出 JSON 正常
[ ] 导出 PNG 正常（脑图视图下）
[ ] Copy as AI Context 正常
[ ] 暗色主题下样式正确
[ ] 亮色主题下样式正确
[ ] 200+ 节点操作流畅
[ ] 设置页面所有选项可用
[ ] 关闭并重新打开 Obsidian，插件正常加载
```

---

## 验收标准

1. TypeScript 无编译错误
2. 所有单元测试通过
3. 手动验收清单全部通过
4. `main.js` 产出 < 300KB（gzip 后 < 80KB）
5. 无 console.log/console.error 残留
6. 暗色和亮色主题下 UI 无异常
7. 200 节点文件操作响应 < 100ms
8. 插件可在 Obsidian 设置中正常启用/禁用
9. 禁用后不影响 Obsidian 其他功能
