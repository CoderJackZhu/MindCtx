# MindCtx for VS Code

Markdown-first structured outline editor with mind map view for Visual Studio Code.

## Installation

### From VS Code Marketplace

Search for "MindCtx" in the Extensions view (Ctrl+Shift+X).

### From VSIX

Download the `.vsix` file from the latest release and install via:

```
code --install-extension vscode-mindctx-0.0.1.vsix
```

## Usage

### Creating a MindCtx File

- Command Palette (Ctrl+Shift+P): "MindCtx: Create New File"
- Create any `.mind.md` file — it opens automatically with the MindCtx editor

### Opening Existing Files

Any file matching `*.mind.md` opens in the MindCtx editor by default. You can also right-click a `.md` file in the Explorer and select "MindCtx: Open with MindCtx".

## Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| MindCtx: Create New File | — | Create a new .mind.md file |
| MindCtx: Open with MindCtx | — | Open current file in MindCtx editor |
| MindCtx: Toggle View | Cmd/Ctrl+Shift+M | Switch between outline and mind map |
| MindCtx: Expand All | Cmd/Ctrl+Shift+E | Expand all collapsed nodes |
| MindCtx: Collapse All | Cmd/Ctrl+Shift+C | Collapse all nodes |
| MindCtx: Export as OPML | — | Export to OPML format |
| MindCtx: Export as JSON | — | Export tree as JSON |
| MindCtx: Export as PNG | — | Export mind map as PNG image |
| MindCtx: Import OPML | — | Import from OPML file |
| MindCtx: Import FreeMind | — | Import from .mm file |
| MindCtx: Copy as AI Context | — | Copy structured content to clipboard |

## Features

### Custom Editor Integration

MindCtx registers as a VS Code Custom Editor for `.mind.md` files. This means:
- Native undo/redo integration (Ctrl+Z/Ctrl+Shift+Z works through VS Code's undo stack)
- File dirty state tracked by VS Code (dot indicator on tab)
- Auto-save supported
- Multiple editors can view the same document simultaneously

### Theme Adaptation

Automatically follows your VS Code color theme:
- Light themes
- Dark themes
- High contrast themes

### View State Persistence

Your view preferences are saved per file:
- Active view (outline or mind map)
- Collapsed/expanded node state

### External File Change Detection

If the `.mind.md` file is modified by another process (e.g., git pull, external editor), MindCtx detects the change and updates automatically.

## Settings

Configure in VS Code Settings (Ctrl+,) under "MindCtx":

| Setting | Default | Description |
|---------|---------|-------------|
| `mindctx.defaultView` | outline | Default view when opening files |
| `mindctx.headingDepth` | 4 | Maximum heading depth (deeper = list items) |
| `mindctx.autoSaveDelay` | 300 | Auto-save debounce in milliseconds |
| `mindctx.outlineFontSize` | 14 | Outline view font size (px) |
| `mindctx.showNotePreview` | true | Show note preview next to titles |
| `mindctx.mindmapDirection` | side | Mind map layout: `side`, `right`, or `left` |

## Development

This package is part of the MindCtx monorepo. From the repository root:

```bash
pnpm install
pnpm --filter vscode-mindctx dev    # watch mode (rebuilds on change)
pnpm --filter vscode-mindctx build  # production build
```

To test in VS Code:
1. Run `pnpm --filter vscode-mindctx dev`
2. Open the `packages/vscode` folder in VS Code
3. Press F5 to launch the Extension Development Host
4. Open any `.mind.md` file in the development host

### Build Output

- `dist/extension.js` — Extension host (Node.js, CJS)
- `dist/webview.js` — Webview UI (browser, IIFE)
- `dist/webview.css` — Webview styles

## License

MIT
