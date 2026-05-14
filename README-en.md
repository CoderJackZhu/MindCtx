# MindDoc

Markdown-first structured outline editor with mind map view — for Obsidian and VS Code.

Write standard Markdown, see interactive outlines, switch to mind maps — all backed by the same `.md` file.

## Features

**Dual View**
- Outline view: drag-and-drop, keyboard shortcuts, inline editing, search & filter
- Mind map view: powered by Mind Elixir, with drag-and-drop, zoom, and focus mode
- One-click switching between views (data stays in sync)

**Round-trip Fidelity**
- Your Markdown file is the source of truth
- Unmodified content preserves exact formatting (`serialize(parse(text)) === text`)
- Edits only touch the changed nodes

**Editing**
- Drag-and-drop reordering (outline & mind map)
- Inline title editing (double-click or F2)
- Keyboard shortcuts: Tab/Shift+Tab (indent/outdent), Enter (new sibling), Delete, Ctrl+Z/Y (undo/redo)
- Task checkbox toggle
- Node detail panel for editing notes and viewing content blocks

**Import & Export**
- Import: OPML (WorkFlowy/Mubu), FreeMind (.mm)
- Export: OPML, JSON, PNG (mind map view)
- Copy as AI Context (structured prompt for LLMs)

## Platforms

| Platform | Package | Notes |
|----------|---------|-------|
| [Obsidian](packages/obsidian/) | `@minddoc/obsidian` | Community plugin, embed blocks, mobile support |
| [VS Code](packages/vscode/) | `vscode-minddoc` | Custom Editor extension, native undo/redo integration |

Both platforms share the same core engine: [`@minddoc/core`](packages/core/).

## File Format

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

The `heading-depth` setting (default 3) controls when headings become list items. See [format spec](docs/format-spec.md) for details.

## Keyboard Shortcuts

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

## Development

```bash
pnpm install          # install dependencies
pnpm build            # build all packages
pnpm test             # run core engine tests (125 tests)
pnpm typecheck        # typecheck all packages
```

### Project Structure

```
packages/
  core/               # Shared engine (parser, serializer, operations, undo, import/export)
  obsidian/           # Obsidian plugin
  vscode/             # VS Code extension
docs/
  format-spec.md      # .mind.md format specification
examples/             # Sample .mind.md files
```

### Tech Stack

- **Tooling**: pnpm workspaces monorepo, TypeScript 5 (strict)
- **Core**: unified/remark (Markdown parsing), tsup (library bundling)
- **UI**: Preact + @preact/signals, Mind Elixir v4 (mind map rendering)
- **Build**: esbuild (Obsidian plugin + VSCode extension dual-target)
- **Testing**: Vitest

### Package Development

```bash
# Develop Obsidian plugin (watch mode)
pnpm --filter @minddoc/obsidian dev

# Develop VS Code extension (watch mode)
pnpm --filter vscode-minddoc dev

# Build core only
pnpm --filter @minddoc/core build

# Run tests
pnpm --filter @minddoc/core test
```

## Documentation

- [Quick Start](docs/快速上手.md)
- [Feature Guide](docs/功能指南.md)
- [Advanced Tips](docs/进阶技巧.md)
- [Format Spec](docs/format-spec.md)

## License

MIT
