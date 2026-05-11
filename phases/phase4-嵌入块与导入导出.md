# Phase 4：嵌入块 + 导入导出

## 前置条件

Phase 3 已完成，以下能力可用：

- 完整的大纲视图和脑图视图
- 视图切换正常
- 所有编辑操作可回写 Markdown
- Mind Elixir 集成完毕

## 目标

1. 支持在任意 Obsidian Markdown 文件中通过代码块嵌入 MindDoc 视图
2. 实现 OPML 导入（支持从幕布迁移）
3. 实现 OPML / JSON / PNG 导出
4. 实现 "Copy as AI Context" 命令

## 新增文件

```
src/
  views/
    EmbedProcessor.ts      # 代码块处理器注册
    EmbedView.tsx           # 嵌入块渲染组件
  importers/
    opml.ts                # OPML 导入
    freemind.ts            # FreeMind .mm 导入
  exporters/
    opml.ts                # OPML 导出
    json.ts                # JSON AST 导出
    image.ts               # PNG/SVG 导出
  commands/
    aiCommands.ts          # AI 相关命令
```

---

## 模块一：EmbedProcessor.ts — 代码块处理器

### 职责

使用 Obsidian 的 `registerMarkdownCodeBlockProcessor` API 拦截 `minddoc` 代码块，将其渲染为交互式嵌入卡片。

### 代码块语法

用户在任意 Markdown 文件中写：

````markdown
```minddoc
file: [[文件名.mind.md]]
mode: switchable
height: 450
default: outline
```
````

### 参数解析

```typescript
interface EmbedConfig {
  file: string;                                  // 必填，[[link]] 或相对路径
  mode: 'outline' | 'mindmap' | 'switchable';   // 默认 switchable
  height: number;                                // 默认 400，单位 px
  default: 'outline' | 'mindmap';               // 默认 outline
  maxDepth: number;                              // 默认 Infinity
  collapsed: boolean;                            // 默认 false
}

function parseEmbedConfig(source: string): EmbedConfig | { error: string } {
  const config: Partial<EmbedConfig> = {};
  const lines = source.trim().split('\n');

  for (const line of lines) {
    const match = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (!match) continue;
    const [, key, value] = match;

    switch (key) {
      case 'file':
        // 支持 [[link]] 和普通路径
        const linkMatch = value.match(/\[\[(.+?)\]\]/);
        config.file = linkMatch ? linkMatch[1] : value.trim();
        break;
      case 'mode':
        if (['outline', 'mindmap', 'switchable'].includes(value.trim())) {
          config.mode = value.trim() as any;
        }
        break;
      case 'height':
        config.height = parseInt(value.trim(), 10) || 400;
        break;
      case 'default':
        if (['outline', 'mindmap'].includes(value.trim())) {
          config.default = value.trim() as any;
        }
        break;
      case 'maxDepth':
        config.maxDepth = parseInt(value.trim(), 10) || Infinity;
        break;
      case 'collapsed':
        config.collapsed = value.trim() === 'true';
        break;
    }
  }

  if (!config.file) {
    return { error: '缺少 file 参数，请指定要嵌入的 .mind.md 文件' };
  }

  return {
    file: config.file,
    mode: config.mode ?? 'switchable',
    height: config.height ?? 400,
    default: config.default ?? 'outline',
    maxDepth: config.maxDepth ?? Infinity,
    collapsed: config.collapsed ?? false,
  };
}
```

### 处理器注册

```typescript
// src/views/EmbedProcessor.ts

export function registerEmbedProcessor(plugin: MindDocPlugin) {
  plugin.registerMarkdownCodeBlockProcessor('minddoc', async (source, el, ctx) => {
    const config = parseEmbedConfig(source);

    if ('error' in config) {
      renderError(el, config.error);
      return;
    }

    // 解析文件路径
    const file = plugin.app.metadataCache.getFirstLinkpathDest(config.file, ctx.sourcePath);

    if (!file) {
      renderFileNotFound(el, config.file, plugin, ctx.sourcePath);
      return;
    }

    // 读取并解析文件
    try {
      const content = await plugin.app.vault.read(file);
      const tree = parse(content, { filePath: file.path });

      // 渲染嵌入视图（使用 Preact render 挂载 EmbedView 组件）
      render(
        <EmbedView tree={tree} config={config} file={file} plugin={plugin} />,
        el
      );
    } catch (e) {
      renderError(el, `解析错误: ${e.message}`);
    }
  });
}
```

---

## 模块二：EmbedView.tsx — 嵌入块渲染

### 布局

```
┌─────────────────────────────────────────────────┐
│ 📄 文件名         [大纲] [脑图] [打开] [刷新]   │
├─────────────────────────────────────────────────┤
│                                                 │
│   只读的大纲视图 或 脑图视图                      │
│                                                 │
│   （固定高度，可滚动）                            │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 组件

```typescript
// src/views/EmbedView.tsx

interface EmbedViewProps {
  tree: MindDocTree;
  config: EmbedConfig;
  file: TFile;
  plugin: MindDocPlugin;
}

function EmbedView({ tree, config, file, plugin }: EmbedViewProps) {
  const [currentView, setCurrentView] = useState(config.default);
  const [currentTree, setCurrentTree] = useState(tree);

  const handleOpen = () => {
    // 在新 tab 中打开完整 MindDoc 视图（使用 getLeaf(true) 不替换当前页面）
    const leaf = plugin.app.workspace.getLeaf(true);
    leaf.setViewState({ type: MINDDOC_VIEW_TYPE, state: { file: file.path } });
  };

  const handleRefresh = async () => {
    const content = await plugin.app.vault.read(file);
    const newTree = parse(content, { filePath: file.path });
    setCurrentTree(newTree);
  };

  return (
    <div class="minddoc-embed" style={{ height: `${config.height}px` }}>
      <div class="minddoc-embed-header">
        <span class="minddoc-embed-title">{file.basename}</span>
        <div class="minddoc-embed-actions">
          {config.mode === 'switchable' && (
            <>
              <button
                class={currentView === 'outline' ? 'is-active' : ''}
                onClick={() => setCurrentView('outline')}
              >大纲</button>
              <button
                class={currentView === 'mindmap' ? 'is-active' : ''}
                onClick={() => setCurrentView('mindmap')}
              >脑图</button>
            </>
          )}
          <button onClick={handleOpen} title="打开文件">打开</button>
          <button onClick={handleRefresh} title="刷新">↻</button>
        </div>
      </div>
      <div class="minddoc-embed-content">
        {currentView === 'outline' ? (
          <ReadOnlyOutline tree={currentTree} maxDepth={config.maxDepth} collapsed={config.collapsed} />
        ) : (
          <ReadOnlyMindMap tree={currentTree} maxDepth={config.maxDepth} />
        )}
      </div>
    </div>
  );
}
```

### 只读大纲组件

与 Phase 2 的 OutlineView 类似，但：
- 无拖拽手柄
- 无 inline 编辑
- 无键盘快捷键（除了折叠/展开）
- 点击节点只折叠/展开，不进入编辑

```typescript
interface ReadOnlyOutlineProps {
  tree: MindDocTree;
  maxDepth: number;        // 最大显示深度
  collapsed: boolean;      // 初始是否全部折叠
}
```

**实现方式：** Phase 2 已在 `OutlineNodeProps` 中预留 `readonly?: boolean` 接口。Phase 4 需要修改以下 Phase 2 创建的文件，补充 readonly 分支逻辑：

**需要修改的文件清单：**

1. **`src/views/components/OutlineNode.tsx`**：当 `readonly === true` 时：
   - 不渲染拖拽手柄（`DragHandle`）
   - 双击/F2 不进入编辑（`InlineEditor` 不激活）
   - 点击标题仅触发折叠/展开，不触发 `onSelect`
   - 不绑定 `draggable`/`ondragstart`/`ondragover`/`ondrop` 事件
2. **`src/views/OutlineView.tsx`**：添加 `readonly` prop，当 `readonly === true` 时：
   - 不注册键盘快捷键（Tab、Enter、Delete、Ctrl+Z 等）
   - 不传递 `onOperation`/`onUndo`/`onRedo` 给子组件
   - 不渲染 OutlineToolbar（嵌入块不需要工具栏）

然后 `ReadOnlyOutline` 组件包装 `OutlineView`，传入 `readonly={true}`：

```typescript
import { signal } from '@preact/signals';

function ReadOnlyOutline({ tree, maxDepth, collapsed }: ReadOnlyOutlineProps) {
  // 使用 useRef + signal 保持类型兼容（OutlineView 期望 Signal<Set<string>>）
  const collapsedIdsSignal = useMemo(() => {
    if (!collapsed) return signal(new Set<string>());
    const ids = new Set<string>();
    function walk(node: MindDocNode) {
      if (node.children.length > 0) ids.add(node.id);
      node.children.forEach(walk);
    }
    tree.root.children.forEach(walk);
    return signal(ids);
  }, []);

  // 只读模式下折叠/展开仍然允许（点击箭头切换）
  const handleToggleCollapse = (nodeId: string) => {
    const newSet = new Set(collapsedIdsSignal.value);
    if (newSet.has(nodeId)) {
      newSet.delete(nodeId);
    } else {
      newSet.add(nodeId);
    }
    collapsedIdsSignal.value = newSet;
  };

  return (
    <OutlineView
      treeSignal={signal(tree)}
      collapsedIds={collapsedIdsSignal}
      selectedNodeId={signal(null)}
      editingNodeId={signal(null)}
      readonly={true}
      maxDepth={maxDepth}
      onOperation={() => {}}
      onUndo={() => {}}
      onRedo={() => {}}
    />
  );
}
```

**注意**：`OutlineView` 在 Phase 2 中接受 `Signal` 类型的 props。`ReadOnlyOutline` 需要使用 `signal()` 创建对应的 Signal 实例包装数据，确保类型兼容。`useMemo` 保证 signal 实例在组件生命周期内稳定不变。

### 只读脑图组件

与 Phase 3 的 MindMapView 类似，但：
- `draggable: false`
- 不注册事件桥接（不需要 `setupMindElixirEvents`）
- 不绑定键盘事件
- 仅支持缩放和平移

```typescript
interface ReadOnlyMindMapProps {
  tree: MindDocTree;
  maxDepth: number;        // 最大显示深度
}
```

实现方式：创建独立的 `ReadOnlyMindMap` 组件，复用 Phase 3 的 Mind Elixir 初始化逻辑，但配置 `draggable: false`、`keypress: false`、`contextMenu: false`、`toolBar: false`、`nodeMenu: false`，不调用 `setupMindElixirEvents`，不绑定 `onKeyDown`。仅保留缩放和平移交互。

### 嵌入块样式

```css
.minddoc-embed {
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.minddoc-embed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--background-secondary);
  border-bottom: 1px solid var(--background-modifier-border);
}

.minddoc-embed-title {
  font-weight: 500;
  font-size: 13px;
  color: var(--text-normal);
}

.minddoc-embed-actions {
  display: flex;
  gap: 4px;
}

.minddoc-embed-actions button {
  padding: 2px 8px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  background: var(--background-modifier-hover);
  color: var(--text-muted);
  cursor: pointer;
}

.minddoc-embed-actions button.is-active {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}

.minddoc-embed-content {
  flex: 1;
  overflow: auto;
}
```

### 错误状态渲染

```typescript
function renderError(el: HTMLElement, message: string) {
  el.createDiv({ cls: 'minddoc-embed-error' }, (div) => {
    div.createSpan({ text: '⚠️ MindDoc: ' + message });
  });
}

function renderFileNotFound(el: HTMLElement, fileName: string, plugin: MindDocPlugin, sourcePath: string) {
  el.createDiv({ cls: 'minddoc-embed-error' }, (div) => {
    div.createSpan({ text: `文件未找到: ${fileName}` });
    const btn = div.createEl('button', { text: '创建文件' });
    btn.addEventListener('click', async () => {
      const content = `---\nminddoc: true\n---\n\n# ${fileName.replace('.mind.md', '')}\n`;
      await plugin.app.vault.create(fileName, content);
      // 触发重新渲染（Obsidian 会自动重新处理代码块）
    });
  });
}
```

---

## 模块三：OPML 导入器

### 支持来源

- 幕布大纲导出的 OPML
- WorkFlowy 导出的 OPML
- 标准 OPML 2.0

### 实现

```typescript
// src/importers/opml.ts

export function importOPML(opmlText: string, fileName: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(opmlText, 'text/xml');

  // 检查解析错误
  const error = doc.querySelector('parsererror');
  if (error) {
    throw new Error('OPML 解析失败: ' + error.textContent);
  }

  const body = doc.querySelector('body');
  if (!body) throw new Error('OPML 格式错误: 缺少 body 元素');

  const title = doc.querySelector('head > title')?.textContent || fileName;
  const headingDepth = 3;  // 默认

  // 递归转换
  function convertOutline(element: Element, depth: number): string {
    const text = element.getAttribute('text') || '';
    const note = element.getAttribute('_note') || '';
    const children = Array.from(element.children).filter(c => c.tagName === 'outline');

    let output = '';

    if (depth === 0) {
      // 根节点不输出（作为文件标题）
    } else if (depth <= headingDepth) {
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

  // 构建 Markdown
  let markdown = `---\nminddoc: true\ndefault-view: outline\nheading-depth: ${headingDepth}\n---\n\n`;
  markdown += `# ${title}\n\n`;

  const topOutlines = Array.from(body.children).filter(c => c.tagName === 'outline');

  if (topOutlines.length === 1) {
    // 单根节点：其子节点作为一级标题
    const root = topOutlines[0];
    const rootTitle = root.getAttribute('text') || title;
    markdown = `---\nminddoc: true\ndefault-view: outline\nheading-depth: ${headingDepth}\n---\n\n`;
    markdown += `# ${rootTitle}\n\n`;
    for (const child of Array.from(root.children).filter(c => c.tagName === 'outline')) {
      markdown += convertOutline(child, 2);  // 从 H2 开始
    }
  } else {
    // 多根节点：每个顶级 outline 作为 H2
    for (const outline of topOutlines) {
      markdown += convertOutline(outline, 2);
    }
  }

  return markdown;
}
```

### 导入命令注册

```typescript
this.addCommand({
  id: 'import-opml',
  name: '导入 OPML 文件',
  callback: async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.opml,.xml';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const fileName = file.name.replace(/\.(opml|xml)$/, '') + '.mind.md';
      const markdown = importOPML(text, fileName);
      const newFile = await this.app.vault.create(fileName, markdown);
      await this.activateMindDocView(newFile);
      new Notice(`已导入: ${fileName}`);
    };
    input.click();
  },
});

this.addCommand({
  id: 'import-freemind',
  name: '导入 FreeMind 文件',
  callback: async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mm';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const fileName = file.name.replace(/\.mm$/, '') + '.mind.md';
      const markdown = importFreeMind(text, fileName);
      const newFile = await this.app.vault.create(fileName, markdown);
      await this.activateMindDocView(newFile);
      new Notice(`已导入: ${fileName}`);
    };
    input.click();
  },
});
```

---

## 模块四：FreeMind 导入器

### 简化版实现

FreeMind 格式也是 XML，结构类似：

```xml
<map version="1.0.1">
  <node TEXT="Root">
    <node TEXT="Child1"/>
    <node TEXT="Child2">
      <node TEXT="GrandChild"/>
    </node>
  </node>
</map>
```

```typescript
// src/importers/freemind.ts

export function importFreeMind(xmlText: string, fileName: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const rootNode = doc.querySelector('map > node');
  if (!rootNode) throw new Error('FreeMind 格式错误: 缺少根节点');

  const headingDepth = 3;
  const title = rootNode.getAttribute('TEXT') || fileName;

  function convert(node: Element, depth: number): string {
    const text = node.getAttribute('TEXT') || '';
    const children = Array.from(node.children).filter(c => c.tagName === 'node');
    let output = '';

    if (depth <= headingDepth) {
      output += '#'.repeat(depth) + ' ' + text + '\n\n';
    } else {
      const indent = '  '.repeat(depth - headingDepth - 1);
      output += indent + '- ' + text + '\n';
    }

    for (const child of children) {
      output += convert(child, depth + 1);
    }
    return output;
  }

  let markdown = `---\nminddoc: true\ndefault-view: outline\nheading-depth: ${headingDepth}\n---\n\n`;
  markdown += `# ${title}\n\n`;
  for (const child of Array.from(rootNode.children).filter(c => c.tagName === 'node')) {
    markdown += convert(child, 2);
  }

  return markdown;
}
```

---

## 模块五：导出器

### OPML 导出

```typescript
// src/exporters/opml.ts

export function exportOPML(tree: MindDocTree): string {
  function nodeToOutline(node: MindDocNode): string {
    const escaped = escapeXml(node.title);
    const noteAttr = node.note ? ` _note="${escapeXml(node.note)}"` : '';

    if (node.children.length === 0) {
      return `<outline text="${escaped}"${noteAttr}/>`;
    }

    const children = node.children.map(nodeToOutline).join('\n');
    return `<outline text="${escaped}"${noteAttr}>\n${children}\n</outline>`;
  }

  const body = tree.root.children.map(nodeToOutline).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(tree.root.title)}</title>
  </head>
  <body>
    <outline text="${escapeXml(tree.root.title)}">
      ${body}
    </outline>
  </body>
</opml>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

### JSON 导出

```typescript
// src/exporters/json.ts

export function exportJSON(tree: MindDocTree): string {
  function simplify(node: MindDocNode): any {
    const obj: any = { title: node.title };
    if (node.note) obj.note = node.note;
    if (node.tags.length > 0) obj.tags = node.tags;
    if (node.checked !== null) obj.checked = node.checked;
    if (node.children.length > 0) {
      obj.children = node.children.map(simplify);
    }
    return obj;
  }

  return JSON.stringify({
    version: 1,
    root: simplify(tree.root),
  }, null, 2);
}
```

### PNG/SVG 导出

```typescript
// src/exporters/image.ts

export async function exportPNG(mindMapContainer: HTMLElement): Promise<Blob> {
  // 使用 html-to-image 库或 Mind Elixir 内置的导出方法
  // Mind Elixir v4 提供 painter.bindSvgExport() 和 painter.bindPngExport()
  const { toBlob } = await import('html-to-image');
  return toBlob(mindMapContainer, {
    backgroundColor: getComputedStyle(mindMapContainer).backgroundColor,
    pixelRatio: 2,
  });
}

export async function exportSVG(mindMapContainer: HTMLElement): Promise<string> {
  const { toSvg } = await import('html-to-image');
  return toSvg(mindMapContainer);
}
```

**注意**：`html-to-image` 需要添加到依赖中（是运行时依赖，不是 devDependency）：

```json
{
  "dependencies": {
    "html-to-image": "^1.11"
  }
}
```

如果 Mind Elixir 自带导出功能，优先使用其内置方法。

---

## 模块六：AI 命令

### Copy as AI Context

```typescript
// src/commands/aiCommands.ts

export function copyAsAIContext(tree: MindDocTree): string {
  const headingDepth = tree.headingDepth;  // 使用文件的 headingDepth 而非硬编码

  function nodeToMarkdown(node: MindDocNode, depth: number): string {
    let output = '';

    if (depth === 0) {
      // 根节点
      output += `# ${node.title}\n\n`;
    } else if (depth <= headingDepth) {
      output += '#'.repeat(depth + 1) + ' ' + node.title + '\n\n';
    } else {
      output += '  '.repeat(depth - headingDepth) + '- ' + node.title + '\n';
    }

    if (node.note) {
      output += node.note + '\n\n';
    }

    for (const child of node.children) {
      output += nodeToMarkdown(child, depth + 1);
    }

    return output;
  }

  let result = `以下是文档 "${tree.root.title}" 的结构化内容：\n\n`;
  result += nodeToMarkdown(tree.root, 0);
  result += `\n---\n`;
  result += `格式说明：这是一个 Markdown 树结构文档。标题层级表示节点深度，列表项表示叶子节点。\n`;
  result += `修改时请保持 Markdown 层级结构，不要输出 JSON，不要改变 frontmatter。\n`;

  return result;
}
```

### 命令注册

```typescript
this.addCommand({
  id: 'copy-ai-context',
  name: '复制为 AI 上下文',
  checkCallback: (checking) => {
    const view = this.getActiveMindDocView();
    if (!view?.tree) return false;
    if (checking) return true;
    const text = copyAsAIContext(view.tree);
    navigator.clipboard.writeText(text);
    new Notice('已复制到剪贴板');
  },
});

this.addCommand({
  id: 'export-opml',
  name: '导出为 OPML',
  checkCallback: (checking) => {
    const view = this.getActiveMindDocView();
    if (!view?.tree) return false;
    if (checking) return true;
    const opml = exportOPML(view.tree);
    this.saveExportFile(opml, view.file!.basename + '.opml', view.file!);
  },
});

this.addCommand({
  id: 'export-json',
  name: '导出为 JSON',
  checkCallback: (checking) => {
    const view = this.getActiveMindDocView();
    if (!view?.tree) return false;
    if (checking) return true;
    const json = exportJSON(view.tree);
    this.saveExportFile(json, view.file!.basename + '.json', view.file!);
  },
});

this.addCommand({
  id: 'export-png',
  name: '导出为 PNG',
  checkCallback: (checking) => {
    const view = this.getActiveMindDocView();
    if (!view?.tree || view.currentViewSignal.value !== 'mindmap') return false;
    if (checking) return true;
    const container = view.containerEl.querySelector('.minddoc-mindmap-container') as HTMLElement;
    if (!container) return;
    exportPNG(container).then((blob) => {
      this.saveExportBlob(blob, view.file!.basename + '.png');
    });
  },
});
```

### 导出文件保存

```typescript
// 在 Plugin 类中
async saveExportFile(content: string, defaultName: string, sourceFile: TFile) {
  // 保存到源文件同目录下（避免污染 vault 根目录）
  const folder = sourceFile.parent?.path || '';
  const exportPath = folder ? `${folder}/${defaultName}` : defaultName;
  await this.app.vault.adapter.write(exportPath, content);
  new Notice(`已导出: ${exportPath}`);
}

// PNG 等 Blob 类型的导出使用浏览器下载（仅桌面端可用）
async saveExportBlob(blob: Blob, defaultName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = defaultName; a.click();
  URL.revokeObjectURL(url);
  new Notice(`已导出: ${defaultName}`);
}
```

---

## 验收标准

### 嵌入块

1. 在任意 Markdown 文件中写 `minddoc` 代码块，预览模式下正确渲染
2. `file: [[xxx.mind.md]]` 语法正确解析链接
3. 嵌入块可切换大纲/脑图视图
4. "打开"按钮正确跳转到完整编辑视图
5. "刷新"按钮重新加载文件内容
6. 文件不存在时显示友好错误和"创建"按钮
7. 配置参数错误时显示明确的错误信息
8. 嵌入块高度正确（可配置）
9. 多个嵌入块在同一页面正常工作

### 导入

10. 从幕布导出的 OPML 能成功导入并生成正确的 .mind.md
11. FreeMind .mm 文件能成功导入
12. 导入时 heading-depth 转换正确（标题 vs 列表）
13. 导入的文件可以直接在 MindDoc 中打开和编辑

### 导出

14. OPML 导出后可被幕布/WorkFlowy 正确导入
15. JSON 导出格式正确，结构清晰
16. PNG 导出命令在脑图视图下可用，生成正确图片
17. "复制为 AI 上下文"输出格式适合直接粘贴给 ChatGPT/Claude

---

## 注意事项

- `registerMarkdownCodeBlockProcessor` 在 Obsidian 阅读模式和实时预览模式下都会触发
- 嵌入块是只读的，不要实现编辑功能
- OPML 导入要处理各种不规范的 OPML（属性名大小写不一致、缺少 head 等）
- 文本类导出（OPML/JSON）使用 `vault.adapter.write` 保存到源文件同目录，兼容 Obsidian 移动端；PNG 等二进制导出使用浏览器下载（仅桌面端）
- html-to-image 在某些情况下会失败（跨域字体、SVG 嵌套），PNG 导出作为 best-effort 功能
