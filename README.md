# MindDoc

Markdown 优先的结构化大纲编辑器，支持思维导图视图，为 Obsidian 打造。

写标准 Markdown，看交互式大纲，切换思维导图——所有数据始终存储在同一个 `.md` 文件中。

## 特性

**双视图**
- 大纲视图：拖拽排序、键盘快捷键、行内编辑
- 思维导图视图：基于 Mind Elixir，支持拖拽重组节点、右键菜单、缩放控制
- 一键切换，数据实时同步

**往返保真**
- Markdown 文件就是唯一的数据源
- 未修改的内容保持原样格式（`serialize(parse(text)) === text`）
- 编辑只影响变化的节点

**编辑能力**
- 拖拽排序（大纲和脑图均支持）
- 行内标题编辑（双击或 F2）
- 快捷键：Tab/Shift+Tab（缩进/提升）、Enter（新建兄弟节点）、Delete（删除）、Ctrl+Z/Y（撤销/重做）
- 任务复选框切换（null → 未选 → 已选 → null）
- 节点详情面板：编辑备注，查看代码块/引用等附属内容

**思维导图增强**
- 右键菜单（添加子节点、删除、编辑等）
- 节点 "+" 按钮快速创建子节点
- Ctrl+滚轮缩放、百分比显示、滑块控制
- 可配置展开方向（左右/上下/右侧/左侧）

**搜索筛选**
- Ctrl+F 按标题搜索节点
- 实时筛选，匹配关键词高亮
- 祖先节点保持可见，不丢失上下文

**嵌入块**
- 在任意 Obsidian 笔记中通过代码块嵌入 MindDoc 视图
- 可配置：视图模式、高度、最大深度、初始折叠状态
- 只读展示，支持视图切换和刷新

````markdown
```minddoc
file: [[我的大纲.mind.md]]
mode: switchable
height: 450
default: outline
```
````

**导入导出**
- 导入：OPML（幕布/WorkFlowy）、FreeMind（.mm）
- 导出：OPML、JSON、PNG（脑图视图下）
- 复制为 AI 上下文（结构化提示词，适合粘贴给 ChatGPT/Claude）

**主题适配**
- 自动跟随 Obsidian 亮色/暗色主题
- 脑图配色从 Obsidian CSS 变量派生

## 安装

### 从 Obsidian 社区插件安装

设置 → 第三方插件 → 浏览 → 搜索 "MindDoc"。

### 手动安装

1. 从 Release 页面下载 `main.js`、`manifest.json`、`styles.css`
2. 创建文件夹 `<仓库>/.obsidian/plugins/minddoc/`
3. 将三个文件复制进去
4. 在设置 → 第三方插件中启用 "MindDoc"

## 使用方法

### 创建 MindDoc 文件

以下任一方式：
- 命令面板：「MindDoc: 创建 MindDoc 文件」
- 直接创建 `.mind.md` 后缀的文件
- 在任意 Markdown 文件的 frontmatter 中添加 `minddoc: true`

### 文件格式

MindDoc 使用标准 Markdown，详细格式规范见 [mind.md 格式规范](docs/format-spec.md)。

简要示例：

```markdown
---
minddoc: true
heading-depth: 3
---

# 项目规划

## 第一阶段

- 需求调研
  - 用户访谈
  - 竞品分析

## 第二阶段

- [ ] 开发实现
- [x] 测试验证
```

`heading-depth`（默认 3）控制标题转列表的分界线。深度 1–N 输出为标题，更深的节点输出为列表项。

### 快捷键

| 按键 | 功能 |
|------|------|
| ↑/↓ | 在节点间导航 |
| Enter | 创建兄弟节点 |
| Tab | 缩进节点 |
| Shift+Tab | 提升节点 |
| Ctrl+↑/↓ | 上移/下移节点 |
| F2 | 编辑节点标题 |
| Delete | 删除节点 |
| Ctrl+Z | 撤销 |
| Ctrl+Shift+Z | 重做 |
| Ctrl+F | 搜索 |
| Ctrl+滚轮 | 缩放脑图 |

### 命令列表

| 命令 | 说明 |
|------|------|
| 创建 MindDoc 文件 | 新建 .mind.md 文件 |
| 以 MindDoc 打开当前文件 | 将当前文件以 MindDoc 视图打开 |
| 切换视图（大纲 ↔ 脑图） | 在大纲和思维导图间切换 |
| 展开全部节点 | 展开所有折叠的节点 |
| 折叠全部节点 | 折叠所有节点 |
| 导入 OPML 文件 | 从 OPML 导入（支持幕布） |
| 导入 FreeMind 文件 | 从 .mm 文件导入 |
| 导出为 OPML | 导出为 OPML 格式 |
| 导出为 JSON | 导出树结构为 JSON |
| 导出为 PNG | 导出脑图为 PNG 图片 |
| 复制为 AI 上下文 | 复制结构化内容用于 AI 对话 |

## 设置项

| 设置 | 默认值 | 说明 |
|------|--------|------|
| 默认视图 | 大纲 | 打开文件时的默认视图 |
| 默认标题深度 | 3 | 标题最大层级，超过后转为列表项 |
| 自动保存延迟 | 300ms | 编辑后写入文件的防抖延迟 |
| 大纲字体大小 | 14px | 大纲视图字体大小 |
| 显示备注预览 | 开启 | 在节点标题旁显示 note 首行 |
| 脑图方向 | 左右展开 | 思维导图展开方向 |
| 虚拟滚动 | 开启 | 大文件自动启用虚拟滚动 |
| 虚拟滚动阈值 | 200 | 节点数超过此值时启用 |
| 嵌入块默认高度 | 400px | 嵌入块默认显示高度 |

## 开发

```bash
npm install
npm run dev        # 监听模式
npm run build      # 生产构建
npm test           # 运行测试（125 个）
npm run typecheck  # TypeScript 类型检查
```

### 项目结构

```
src/
  core/           # 纯逻辑层（解析器、序列化器、操作、撤销、哈希）
  views/          # Preact 组件（大纲、脑图、嵌入块）
    components/   # 子组件（OutlineNode、DetailPanel、SearchBar 等）
  bridge/         # Mind Elixir 集成（数据转换 + 主题适配）
  importers/      # OPML、FreeMind 导入器
  exporters/      # OPML、JSON、图片导出器
  commands/       # AI 命令（复制为 AI 上下文）
  settings/       # 插件设置
  utils/          # 工具函数
tests/            # Vitest 测试套件（9 个文件，125 个测试）
examples/         # 示例 .mind.md 文件
docs/             # 文档（格式规范等）
```

### 技术栈

- TypeScript 5.4（严格模式，ES2022）
- Preact + @preact/signals（UI 渲染）
- unified/remark（Markdown 解析，含 GFM 和数学公式支持）
- Mind Elixir v4（思维导图渲染）
- esbuild（打包构建）
- Vitest（单元测试）

## 许可证

MIT
