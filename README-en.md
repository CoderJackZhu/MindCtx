# MindDoc

Markdown-first structured outline editor for Obsidian with mind map view.

Write standard Markdown, see interactive outlines, switch to mind maps — all backed by the same `.md` file.

## Features

**Dual View**
- Outline view with drag-and-drop, keyboard shortcuts, inline editing
- Mind map view powered by Mind Elixir, with drag-and-drop node reorganization
- One-click switching between views (data stays in sync)

**Round-trip Fidelity**
- Your Markdown file is the source of truth
- Unmodified content preserves exact formatting (`serialize(parse(text)) === text`)
- Edits only touch the changed nodes

**Editing**
- Drag-and-drop reordering (outline & mind map)
- Inline title editing (double-click or F2)
- Keyboard shortcuts: Tab/Shift+Tab (indent/outdent), Enter (new sibling), Delete, Ctrl+Z/Y (undo/redo)
- Task checkbox toggle (null → unchecked → checked → null)
- Node detail panel for editing notes and viewing content blocks

**Search & Filter**
- Ctrl+F to search nodes by title
- Real-time filtering with match highlighting
- Ancestor nodes stay visible for context

**Embed Blocks**
- Embed MindDoc views in any Obsidian note via code blocks
- Configurable: view mode, height, max depth, initial collapse state
- Read-only with view switching and refresh

````markdown
```minddoc
file: [[my-outline.mind.md]]
mode: switchable
height: 450
default: outline
```
````

**Import & Export**
- Import: OPML (幕布/WorkFlowy), FreeMind (.mm)
- Export: OPML, JSON, PNG (mind map view)
- Copy as AI Context (structured prompt for LLMs)

**Theme Adaptive**
- Automatically follows Obsidian light/dark theme
- Mind map colors derived from Obsidian CSS variables

## Installation

### From Obsidian Community Plugins

Search for "MindDoc" in Settings → Community Plugins → Browse.

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create folder `<vault>/.obsidian/plugins/minddoc/`
3. Copy the three files into that folder
4. Enable "MindDoc" in Settings → Community Plugins

## Usage

### Creating a MindDoc File

Either:
- Use command palette: "MindDoc: 创建 MindDoc 文件"
- Create any `.mind.md` file
- Add `minddoc: true` to any Markdown file's frontmatter

### File Format

MindDoc works with standard Markdown. Headings become tree branches, lists become leaf nodes:

```markdown
---
minddoc: true
heading-depth: 3
---

# Project Plan

## Phase 1

- Research
  - User interviews
  - Competitor analysis

## Phase 2

- Implementation
- Testing
```

The `heading-depth` setting (default 3) controls when headings become list items. Depth 1–N are headings, deeper nodes are list items.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| ↑/↓ | Navigate between nodes |
| Enter | Create sibling node |
| Tab | Indent node |
| Shift+Tab | Outdent node |
| Ctrl+↑/↓ | Move node up/down |
| F2 | Edit node title |
| Delete | Delete node |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+F | Search |

### Commands

| Command | Description |
|---------|-------------|
| 创建 MindDoc 文件 | Create a new .mind.md file |
| 以 MindDoc 打开当前文件 | Open current file in MindDoc view |
| 切换视图（大纲 ↔ 脑图） | Toggle between outline and mind map |
| 展开全部节点 | Expand all nodes |
| 折叠全部节点 | Collapse all nodes |
| 导入 OPML 文件 | Import from OPML |
| 导入 FreeMind 文件 | Import from .mm |
| 导出为 OPML | Export to OPML |
| 导出为 JSON | Export tree as JSON |
| 导出为 PNG | Export mind map as PNG |
| 复制为 AI 上下文 | Copy structured content for LLM prompts |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| 默认视图 | outline | Default view when opening files |
| 默认标题深度 | 3 | Heading levels before converting to list items |
| 自动保存延迟 | 300ms | Debounce delay before writing to file |
| 大纲字体大小 | 14px | Font size in outline view |
| 显示备注预览 | true | Show note preview next to node title |
| 脑图方向 | side | Mind map layout direction |
| 虚拟滚动 | true | Enable virtual scrolling for large files |
| 虚拟滚动阈值 | 200 | Node count threshold for virtual scrolling |
| 嵌入块默认高度 | 400px | Default height for embed blocks |

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production build
npm test         # run tests
npm run typecheck # TypeScript check
```

### Architecture

```
src/
  core/           # Pure logic (parser, serializer, operations, undo)
  views/          # Preact components (outline, mind map, embed)
  bridge/         # Mind Elixir integration (data + theme)
  importers/      # OPML, FreeMind importers
  exporters/      # OPML, JSON, image exporters
  commands/       # AI commands
  settings/       # Plugin settings
  utils/          # Debounce utility
tests/            # Vitest test suite (75 tests)
```

### Tech Stack

- TypeScript (strict mode, ES2022)
- Preact + @preact/signals (UI rendering)
- unified/remark (Markdown parsing)
- Mind Elixir v4 (mind map rendering)
- esbuild (bundling)
- Vitest (testing)

## License

MIT
