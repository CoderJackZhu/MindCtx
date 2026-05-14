# MindCtx for Obsidian

Markdown 优先的结构化大纲编辑器 Obsidian 插件，支持思维导图视图。

## 安装

### 从社区插件安装

设置 → 第三方插件 → 浏览 → 搜索 "MindCtx"。

### 手动安装

1. 从 Release 页面下载 `main.js`、`manifest.json`、`styles.css`
2. 创建文件夹 `<仓库>/.obsidian/plugins/mindctx/`
3. 将三个文件复制进去
4. 在设置 → 第三方插件中启用 "MindCtx"

## 使用

### 创建文件

- 命令面板（Ctrl/Cmd+P）：「MindCtx: 创建 MindCtx 文件」
- 直接创建 `.mind.md` 后缀的文件
- 在任意 Markdown 文件的 frontmatter 中添加 `mindctx: true`

### 命令列表

| 命令 | 说明 |
|------|------|
| 创建 MindCtx 文件 | 新建 .mind.md 文件 |
| 以 MindCtx 打开当前文件 | 切换到 MindCtx 视图 |
| 切换视图（大纲 ↔ 脑图） | 大纲/思维导图切换 |
| 展开全部节点 / 折叠全部节点 | 批量展开/折叠 |
| 导入 OPML 文件 | 从 OPML 导入 |
| 导入 FreeMind 文件 | 从 .mm 文件导入 |
| 导出为 OPML / JSON / PNG | 导出当前文档 |
| 复制为 AI 上下文 | 复制结构化内容到剪贴板 |

## Obsidian 专属功能

### 嵌入块

在任意 Obsidian 笔记中嵌入 MindCtx 视图：

````markdown
```mindctx
file: [[我的大纲.mind.md]]
mode: switchable
height: 450
default: outline
collapsed: false
maxDepth: 4
```
````

| 参数 | 默认值 | 说明 |
|------|--------|------|
| file | （必填） | 目标文件，支持 `[[link]]` 或相对路径 |
| mode | switchable | `outline` / `mindmap` / `switchable` |
| height | 400 | 嵌入块高度（px） |
| default | outline | 初始视图 |
| collapsed | false | 是否初始折叠 |
| maxDepth | 无限 | 最大显示深度 |

### 移动端支持

MindCtx 在 Obsidian 移动端可用大纲视图。脑图视图在小屏幕上体验可能受限。

### 主题适配

自动跟随 Obsidian 亮色/暗色主题，脑图配色从 CSS 变量派生。

### CSS 自定义

通过 Obsidian CSS snippet 自定义样式：

```css
/* .obsidian/snippets/mindctx-custom.css */
.mindctx-node { height: 36px; }
.mindctx-highlight { background: rgba(100, 200, 255, 0.3); }
```

## 设置

| 设置 | 默认值 | 说明 |
|------|--------|------|
| 默认视图 | 大纲 | 打开文件时的默认视图 |
| 默认标题深度 | 3 | heading-depth 全局默认值 |
| 自动保存延迟 | 300ms | 编辑防抖延迟 |
| 大纲字体大小 | 14px | 大纲视图字体大小 |
| 显示备注预览 | 开启 | 节点标题旁显示 note 首行 |
| 脑图方向 | 左右展开 | 思维导图展开方向 |

## 开发

本包是 MindCtx monorepo 的一部分。从仓库根目录：

```bash
pnpm install
pnpm --filter @mindctx/obsidian dev    # 监听模式
pnpm --filter @mindctx/obsidian build  # 生产构建
```

构建产物为 `main.js`，可直接复制到 Obsidian vault 的 plugins 目录使用。

## 许可证

MIT
