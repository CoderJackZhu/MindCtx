# VSCode MindCtx — Phase 0-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the MindCtx project into a pnpm monorepo with a shared `@mindctx/core` package, then build the VSCode extension skeleton with Custom Editor, postMessage communication, and file I/O.

**Architecture:** Extract pure logic (parser, serializer, operations, undo, hash, types, importers, exporters, AI context builder, bridge data conversion, debounce) into `packages/core`. Obsidian plugin becomes `packages/obsidian` consuming core. New `packages/vscode` registers a CustomEditorProvider that renders a Webview, communicates via typed postMessage protocol, and manages file read/write with debounced saves.

**Tech Stack:** TypeScript 5.4, pnpm workspaces, tsup (core build), esbuild (extension + webview bundle), Preact, Vitest

---

## File Structure

### Phase 0 — Monorepo restructure

```
mindctx/                          ← repo root (rename conceptual, same git repo)
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── parser.ts         ← from src/core/parser.ts
│   │   │   ├── serializer.ts     ← from src/core/serializer.ts
│   │   │   ├── operations.ts     ← from src/core/operations.ts
│   │   │   ├── undo.ts           ← from src/core/undo.ts (keep UndoManager for obsidian, export invertOperation/executeOperation for vscode)
│   │   │   ├── hash.ts           ← from src/core/hash.ts
│   │   │   ├── types.ts          ← from src/core/types.ts
│   │   │   ├── importers/
│   │   │   │   ├── opml.ts       ← from src/importers/opml.ts
│   │   │   │   └── freemind.ts   ← from src/importers/freemind.ts
│   │   │   ├── exporters/
│   │   │   │   ├── opml.ts       ← from src/exporters/opml.ts
│   │   │   │   └── json.ts       ← from src/exporters/json.ts
│   │   │   ├── bridge/
│   │   │   │   └── mindElixirBridge.ts  ← from src/bridge/mindElixirBridge.ts (data conversion only)
│   │   │   ├── ai/
│   │   │   │   └── contextBuilder.ts    ← from src/commands/aiCommands.ts
│   │   │   ├── utils/
│   │   │   │   └── debounce.ts   ← from src/utils/debounce.ts
│   │   │   └── index.ts          ← barrel export
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsup.config.ts
│   └── obsidian/
│       ├── src/
│       │   ├── main.ts           ← from src/main.ts (imports from @mindctx/core)
│       │   ├── views/            ← from src/views/
│       │   ├── bridge/
│       │   │   └── mindElixirTheme.ts  ← from src/bridge/mindElixirTheme.ts (Obsidian-specific theming)
│       │   ├── exporters/
│       │   │   └── image.ts      ← from src/exporters/image.ts (DOM-dependent, stays in obsidian)
│       │   ├── settings/
│       │   │   └── settings.ts   ← from src/settings/settings.ts
│       │   ├── state.ts          ← from src/state.ts
│       │   ├── constants.ts      ← from src/constants.ts
│       │   └── utils/            ← (empty for now, platform utils if needed)
│       ├── esbuild.config.mjs    ← from esbuild.config.mjs (adjusted paths)
│       ├── manifest.json         ← from manifest.json
│       ├── styles.css            ← from styles.css
│       ├── package.json
│       └── tsconfig.json
├── tests/                        ← stays at root (tests @mindctx/core)
│   ├── parser.test.ts
│   ├── serializer.test.ts
│   ├── operations.test.ts
│   ├── undo.test.ts
│   ├── hash.test.ts
│   ├── roundtrip.test.ts
│   ├── perf.test.ts
│   ├── debounce.test.ts
│   ├── opml.test.ts
│   └── fixtures/
├── package.json                  ← workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── vitest.config.ts
```

### Phase 1 — VSCode extension skeleton

```
packages/vscode/
├── src/
│   ├── extension.ts              ← activate/deactivate, register provider + commands
│   ├── MindCtxEditorProvider.ts  ← CustomEditorProvider, webview lifecycle, multi-panel mgmt
│   ├── MindCtxDocument.ts        ← CustomDocument, tree state, edit tracking, file I/O
│   ├── types/
│   │   └── messages.ts           ← ExtToWebview, WebviewToExt, ViewState types
│   └── webview/
│       ├── index.tsx             ← Webview entry point (mount Preact app)
│       ├── App.tsx               ← Root component, placeholder UI
│       └── WebviewBridge.ts      ← postMessage abstraction, signals
├── package.json                  ← VSCode extension manifest (activationEvents, contributes)
├── tsconfig.json
├── esbuild.config.mjs            ← Builds extension.js + webview.js + webview.css
└── media/
    └── icon.png                  ← Extension icon placeholder
```

---

## Task 1: Initialize pnpm workspace root

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json` (workspace root, replaces current)
- Create: `tsconfig.base.json`

- [ ] **Step 1: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 2: Create workspace root package.json**

```json
{
  "name": "mindctx",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.4",
    "vitest": "^2.0",
    "@types/node": "^20"
  }
}
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "jsx": "react",
    "jsxFactory": "h",
    "jsxFragmentFactory": "Fragment"
  }
}
```

- [ ] **Step 4: Update vitest.config.ts for monorepo**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@mindctx/core': './packages/core/src/index.ts',
    },
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json vitest.config.ts
git commit -m "chore: initialize pnpm monorepo workspace structure"
```

---

## Task 2: Create @mindctx/core package

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsup.config.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Create packages/core directory and package.json**

```bash
mkdir -p packages/core/src
```

```json
{
  "name": "@mindctx/core",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "unified": "^11",
    "remark-parse": "^11",
    "remark-frontmatter": "^5",
    "remark-gfm": "^4",
    "remark-math": "^6",
    "yaml": "^2"
  },
  "devDependencies": {
    "typescript": "^5.4",
    "tsup": "^8"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['mind-elixir'],
});
```

- [ ] **Step 4: Create barrel export src/index.ts**

```typescript
export * from './types.js';
export { parse } from './parser.js';
export { serialize } from './serializer.js';
export { applyPartialOperation, findNode, findParent, findIndex, getAbsoluteDepth, recalculateNodeTypes } from './operations.js';
export { invertOperation, UndoManager } from './undo.js';
export { generateNodeId } from './hash.js';
export { importOPML } from './importers/opml.js';
export { importFreeMind } from './importers/freemind.js';
export { exportOPML } from './exporters/opml.js';
export { exportJSON } from './exporters/json.js';
export { copyAsAIContext } from './ai/contextBuilder.js';
export { treeToMindElixirData, mindElixirNodeToId } from './bridge/mindElixirBridge.js';
export { debounce } from './utils/debounce.js';
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/
git commit -m "chore: create @mindctx/core package skeleton"
```

---

## Task 3: Move core source files

**Files:**
- Move: `src/core/*.ts` → `packages/core/src/`
- Move: `src/importers/` → `packages/core/src/importers/`
- Move: `src/exporters/opml.ts`, `src/exporters/json.ts` → `packages/core/src/exporters/`
- Move: `src/commands/aiCommands.ts` → `packages/core/src/ai/contextBuilder.ts`
- Move: `src/utils/debounce.ts` → `packages/core/src/utils/debounce.ts`
- Move: `src/bridge/mindElixirBridge.ts` → `packages/core/src/bridge/mindElixirBridge.ts`

- [ ] **Step 1: Move core files**

```bash
mv src/core/parser.ts packages/core/src/parser.ts
mv src/core/serializer.ts packages/core/src/serializer.ts
mv src/core/operations.ts packages/core/src/operations.ts
mv src/core/undo.ts packages/core/src/undo.ts
mv src/core/hash.ts packages/core/src/hash.ts
mv src/core/types.ts packages/core/src/types.ts
```

- [ ] **Step 2: Move importers**

```bash
mkdir -p packages/core/src/importers
mv src/importers/opml.ts packages/core/src/importers/opml.ts
mv src/importers/freemind.ts packages/core/src/importers/freemind.ts
```

- [ ] **Step 3: Move exporters (excluding image.ts which depends on DOM)**

```bash
mkdir -p packages/core/src/exporters
mv src/exporters/opml.ts packages/core/src/exporters/opml.ts
mv src/exporters/json.ts packages/core/src/exporters/json.ts
```

- [ ] **Step 4: Move AI context builder**

```bash
mkdir -p packages/core/src/ai
mv src/commands/aiCommands.ts packages/core/src/ai/contextBuilder.ts
```

- [ ] **Step 5: Move debounce utility**

```bash
mkdir -p packages/core/src/utils
mv src/utils/debounce.ts packages/core/src/utils/debounce.ts
```

- [ ] **Step 6: Move Mind Elixir bridge (data conversion only)**

```bash
mkdir -p packages/core/src/bridge
mv src/bridge/mindElixirBridge.ts packages/core/src/bridge/mindElixirBridge.ts
```

- [ ] **Step 7: Fix import paths in moved files**

All moved files currently use relative imports like `'../core/types.js'`. Update them to local relative paths:

In `packages/core/src/importers/opml.ts`:
```typescript
// Change: import type { ... } from '../core/types.js';
// To:
import type { ... } from '../types.js';
```

In `packages/core/src/exporters/opml.ts` and `json.ts`:
```typescript
// Change: import type { ... } from '../core/types.js';
// To:
import type { ... } from '../types.js';
```

In `packages/core/src/ai/contextBuilder.ts`:
```typescript
// Change: import type { MindCtxTree, MindCtxNode } from '../core/types.js';
// To:
import type { MindCtxTree, MindCtxNode } from '../types.js';
```

In `packages/core/src/bridge/mindElixirBridge.ts`:
```typescript
// Change: import type { MindCtxTree, MindCtxNode, PartialOperation } from '../core/types.js';
// To:
import type { MindCtxTree, MindCtxNode, PartialOperation } from '../types.js';
// Also remove: import type { MindCtxSettings } from '../settings/settings.js';
// Define the direction type locally or export from types.ts
```

In `packages/core/src/utils/debounce.ts`:
- Change `window.setTimeout` to `setTimeout` (no `window` global in Node/extension host)
- Change `window.clearTimeout` to `clearTimeout`

- [ ] **Step 8: Handle mindElixirBridge dependency on MindCtxSettings type**

The bridge file imports `MindCtxSettings` for the direction type. Extract just the direction type into core:

Add to `packages/core/src/types.ts`:
```typescript
export type MindMapDirection = 'side' | 'left' | 'right';
```

Update `packages/core/src/bridge/mindElixirBridge.ts` to import from `'../types.js'` instead of settings.

- [ ] **Step 9: Run tests to verify nothing broke**

```bash
pnpm install
pnpm test
```

Expected: All 125 tests pass (imports resolve through vitest alias).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: move core logic to packages/core/src"
```

---

## Task 4: Create Obsidian package

**Files:**
- Create: `packages/obsidian/package.json`
- Create: `packages/obsidian/tsconfig.json`
- Move: `src/main.ts` → `packages/obsidian/src/main.ts`
- Move: `src/views/` → `packages/obsidian/src/views/`
- Move: `src/bridge/mindElixirTheme.ts` → `packages/obsidian/src/bridge/mindElixirTheme.ts`
- Move: `src/exporters/image.ts` → `packages/obsidian/src/exporters/image.ts`
- Move: `src/settings/` → `packages/obsidian/src/settings/`
- Move: `src/state.ts` → `packages/obsidian/src/state.ts`
- Move: `src/constants.ts` → `packages/obsidian/src/constants.ts`
- Move: `esbuild.config.mjs` → `packages/obsidian/esbuild.config.mjs`
- Move: `manifest.json` → `packages/obsidian/manifest.json`
- Move: `styles.css` → `packages/obsidian/styles.css`

- [ ] **Step 1: Create packages/obsidian directory structure**

```bash
mkdir -p packages/obsidian/src/{views/components,bridge,exporters,settings}
```

- [ ] **Step 2: Create packages/obsidian/package.json**

```json
{
  "name": "@mindctx/obsidian",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node esbuild.config.mjs production",
    "dev": "node esbuild.config.mjs",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@mindctx/core": "workspace:*",
    "preact": "^10.19",
    "@preact/signals": "^1.2",
    "mind-elixir": "^4.0",
    "html-to-image": "^1.11"
  },
  "devDependencies": {
    "typescript": "^5.4",
    "obsidian": "^1.5",
    "esbuild": "^0.20"
  }
}
```

- [ ] **Step 3: Create packages/obsidian/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Move Obsidian-specific source files**

```bash
mv src/main.ts packages/obsidian/src/main.ts
mv src/views/* packages/obsidian/src/views/
mv src/bridge/mindElixirTheme.ts packages/obsidian/src/bridge/mindElixirTheme.ts
mv src/exporters/image.ts packages/obsidian/src/exporters/image.ts
mv src/settings/settings.ts packages/obsidian/src/settings/settings.ts
mv src/state.ts packages/obsidian/src/state.ts
mv src/constants.ts packages/obsidian/src/constants.ts
mv esbuild.config.mjs packages/obsidian/esbuild.config.mjs
mv manifest.json packages/obsidian/manifest.json
mv styles.css packages/obsidian/styles.css
```

- [ ] **Step 5: Update import paths in Obsidian source files**

All files that previously imported from `'../core/types.js'`, `'../core/parser.js'` etc. now import from `@mindctx/core`:

In `packages/obsidian/src/main.ts`:
```typescript
// Change: import { parse } from './core/parser.js';
// To:
import { parse, serialize, applyPartialOperation, type MindCtxTree, type PartialOperation } from '@mindctx/core';
```

In `packages/obsidian/src/views/MindCtxView.tsx` (and other view files):
```typescript
// Change: import type { MindCtxTree, MindCtxNode } from '../core/types.js';
// To:
import type { MindCtxTree, MindCtxNode } from '@mindctx/core';
```

Apply same pattern to all files importing from the old `../core/`, `../importers/`, `../exporters/`, `../commands/`, `../utils/`, `../bridge/mindElixirBridge` paths.

Files that import from `@mindctx/core`:
- `main.ts` — parser, serializer, operations, undo, importers, exporters, AI, types
- `views/MindCtxView.tsx` — types, operations, undo
- `views/OutlineView.tsx` — types, operations
- `views/MindMapView.tsx` — types, bridge
- `views/MindCtxRoot.tsx` — types
- `views/EmbedProcessor.ts` — parser, types
- `views/EmbedView.tsx` — types
- `views/components/OutlineNode.tsx` — types
- `views/components/DetailPanel.tsx` — types, operations

Files that stay as local imports (Obsidian-specific):
- `bridge/mindElixirTheme.ts` — pure Obsidian CSS theming
- `exporters/image.ts` — DOM-dependent
- `settings/settings.ts` — Obsidian PluginSettingTab
- `state.ts` — Obsidian vault API

- [ ] **Step 6: Update esbuild.config.mjs for new entry point**

```javascript
import esbuild from 'esbuild';

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

(Same as before — esbuild resolves `@mindctx/core` via node_modules symlink from pnpm workspace.)

- [ ] **Step 7: Run pnpm install and verify build**

```bash
pnpm install
cd packages/obsidian && pnpm run build
```

Expected: `packages/obsidian/main.js` generated successfully.

- [ ] **Step 8: Run tests**

```bash
cd ../.. && pnpm test
```

Expected: All 125 tests pass.

- [ ] **Step 9: Clean up old src/ directory**

```bash
rm -rf src/
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: move obsidian plugin to packages/obsidian, consuming @mindctx/core"
```

---

## Task 5: Update test imports for monorepo

**Files:**
- Modify: `tests/parser.test.ts`
- Modify: `tests/serializer.test.ts`
- Modify: `tests/operations.test.ts`
- Modify: `tests/undo.test.ts`
- Modify: `tests/hash.test.ts`
- Modify: `tests/roundtrip.test.ts`
- Modify: `tests/perf.test.ts`
- Modify: `tests/debounce.test.ts`
- Modify: `tests/opml.test.ts`

- [ ] **Step 1: Update all test imports to use @mindctx/core**

All test files currently import like:
```typescript
import { parse } from '../src/core/parser.js';
```

Change to:
```typescript
import { parse } from '@mindctx/core';
```

Apply to all 9 test files. Each test imports different symbols but all from `@mindctx/core`.

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Expected: All 125 tests pass.

- [ ] **Step 3: Run typecheck on core package**

```bash
cd packages/core && pnpm run typecheck
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: update test imports to use @mindctx/core package"
```

---

## Task 6: Verify Obsidian plugin release artifact structure

**Files:**
- Verify: `packages/obsidian/main.js` exists after build
- Verify: `packages/obsidian/manifest.json` exists
- Verify: `packages/obsidian/styles.css` exists

- [ ] **Step 1: Full build and verify artifacts**

```bash
pnpm -r build
ls -la packages/obsidian/main.js packages/obsidian/manifest.json packages/obsidian/styles.css
```

Expected: All 3 files present. `main.js` is a valid CJS bundle.

- [ ] **Step 2: Verify main.js bundles core correctly**

```bash
grep -c "function parse" packages/obsidian/main.js
```

Expected: At least 1 match — confirms @mindctx/core is bundled inline (not left as external).

- [ ] **Step 3: Run full test suite one final time**

```bash
pnpm test
```

Expected: All 125 tests pass.

- [ ] **Step 4: Commit with verification note**

```bash
git add -A
git commit -m "chore: verify monorepo restructure - obsidian artifacts intact, all tests pass"
```

---

## Task 7: Create VSCode extension package.json

**Files:**
- Create: `packages/vscode/package.json`
- Create: `packages/vscode/tsconfig.json`

- [ ] **Step 1: Create directory**

```bash
mkdir -p packages/vscode/src/{types,webview,commands}
mkdir -p packages/vscode/media
```

- [ ] **Step 2: Create package.json (VSCode extension manifest)**

```json
{
  "name": "vscode-mindctx",
  "displayName": "MindCtx",
  "description": "Markdown-first structured outline editor with mind map view",
  "version": "0.0.1",
  "publisher": "mindctx",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "activationEvents": [
    "onCustomEditor:mindctx.editor"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "customEditors": [
      {
        "viewType": "mindctx.editor",
        "displayName": "MindCtx Editor",
        "selector": [
          { "filenamePattern": "*.mind.md" }
        ],
        "priority": "default"
      }
    ],
    "commands": [
      {
        "command": "mindctx.create",
        "title": "MindCtx: Create New File"
      },
      {
        "command": "mindctx.openAs",
        "title": "MindCtx: Open with MindCtx"
      },
      {
        "command": "mindctx.toggleView",
        "title": "MindCtx: Toggle View (Outline / Mind Map)",
        "icon": "$(symbol-structure)",
        "enablement": "activeCustomEditorId == 'mindctx.editor'"
      },
      {
        "command": "mindctx.expandAll",
        "title": "MindCtx: Expand All",
        "enablement": "activeCustomEditorId == 'mindctx.editor'"
      },
      {
        "command": "mindctx.collapseAll",
        "title": "MindCtx: Collapse All",
        "enablement": "activeCustomEditorId == 'mindctx.editor'"
      },
      {
        "command": "mindctx.export.opml",
        "title": "MindCtx: Export as OPML",
        "enablement": "activeCustomEditorId == 'mindctx.editor'"
      },
      {
        "command": "mindctx.export.json",
        "title": "MindCtx: Export as JSON",
        "enablement": "activeCustomEditorId == 'mindctx.editor'"
      },
      {
        "command": "mindctx.export.png",
        "title": "MindCtx: Export as PNG",
        "enablement": "activeCustomEditorId == 'mindctx.editor'"
      },
      {
        "command": "mindctx.import.opml",
        "title": "MindCtx: Import OPML"
      },
      {
        "command": "mindctx.import.freemind",
        "title": "MindCtx: Import FreeMind"
      },
      {
        "command": "mindctx.copyAIContext",
        "title": "MindCtx: Copy as AI Context",
        "enablement": "activeCustomEditorId == 'mindctx.editor'"
      }
    ],
    "menus": {
      "editor/title": [
        {
          "command": "mindctx.toggleView",
          "when": "activeCustomEditorId == 'mindctx.editor'",
          "group": "navigation"
        }
      ],
      "explorer/context": [
        {
          "command": "mindctx.openAs",
          "when": "resourceExtname == .md",
          "group": "navigation"
        }
      ]
    },
    "configuration": {
      "title": "MindCtx",
      "properties": {
        "mindctx.defaultView": {
          "type": "string",
          "enum": ["outline", "mindmap"],
          "default": "outline",
          "description": "Default view when opening a file"
        },
        "mindctx.headingDepth": {
          "type": "number",
          "minimum": 1,
          "maximum": 6,
          "default": 3,
          "description": "Maximum heading depth (deeper nodes become list items)"
        },
        "mindctx.autoSaveDelay": {
          "type": "number",
          "minimum": 100,
          "maximum": 5000,
          "default": 300,
          "description": "Auto-save debounce delay in milliseconds"
        },
        "mindctx.outlineFontSize": {
          "type": "number",
          "minimum": 10,
          "maximum": 24,
          "default": 14,
          "description": "Outline view font size in pixels"
        },
        "mindctx.showNotePreview": {
          "type": "boolean",
          "default": true,
          "description": "Show note preview next to node titles"
        },
        "mindctx.mindmapDirection": {
          "type": "string",
          "enum": ["side", "right", "left"],
          "default": "side",
          "description": "Mind map layout direction"
        }
      }
    }
  },
  "scripts": {
    "build": "node esbuild.config.mjs production",
    "dev": "node esbuild.config.mjs --watch",
    "typecheck": "tsc --noEmit",
    "package": "vsce package"
  },
  "dependencies": {
    "@mindctx/core": "workspace:*"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "typescript": "^5.4",
    "esbuild": "^0.20",
    "preact": "^10.19",
    "@preact/signals": "^1.2"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["src/webview/**/*"]
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/vscode/
git commit -m "feat(vscode): create extension package with manifest and configuration"
```

---

## Task 8: Define message protocol types

**Files:**
- Create: `packages/vscode/src/types/messages.ts`

- [ ] **Step 1: Write the complete protocol type definitions**

```typescript
import type { MindCtxTree, PartialOperation } from '@mindctx/core';

// --- Settings passed to Webview ---

export interface MindCtxSettings {
  defaultView: 'outline' | 'mindmap';
  headingDepth: number;
  autoSaveDelay: number;
  outlineFontSize: number;
  showNotePreview: boolean;
  mindmapDirection: 'side' | 'right' | 'left';
}

// --- Theme colors ---

export interface ThemeColors {
  kind: 'light' | 'dark' | 'high-contrast';
  foreground: string;
  background: string;
  accent: string;
  border: string;
  nodeBackground: string;
  selectedBackground: string;
}

// --- View state ---

export interface PersistedViewState {
  collapsedNodeIds: string[];
  activeView: 'outline' | 'mindmap';
}

export interface TransientViewState {
  collapsedNodeIds: string[];
  selectedNodeId: string | null;
  activeView: 'outline' | 'mindmap';
  scrollPosition: number;
}

// --- Commands sent to Webview ---

export type WebviewCommand =
  | { name: 'expandAll' }
  | { name: 'collapseAll' }
  | { name: 'toggleView' }
  | { name: 'export.png' };

// --- Extension → Webview messages ---

export type ExtToWebview =
  | { type: 'init'; tree: MindCtxTree; settings: MindCtxSettings; state: PersistedViewState | null }
  | { type: 'treeUpdated'; tree: MindCtxTree; reason: 'self' | 'peerEdit' | 'undo' | 'redo' | 'externalChange' }
  | { type: 'themeChanged'; colors: ThemeColors }
  | { type: 'settingsChanged'; settings: Partial<MindCtxSettings> }
  | { type: 'command'; command: WebviewCommand }
  | { type: 'error'; message: string; operationId?: string };

// --- Webview → Extension messages ---

export type WebviewToExt =
  | { type: 'ready' }
  | { type: 'operation'; op: PartialOperation; operationId: string }
  | { type: 'stateSync'; state: TransientViewState }
  | { type: 'exportResult'; format: 'png'; data: string }
  | { type: 'requestSave' };
```

- [ ] **Step 2: Verify types compile**

```bash
cd packages/vscode && npx tsc --noEmit src/types/messages.ts
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/vscode/src/types/
git commit -m "feat(vscode): define postMessage protocol types"
```

---

## Task 9: Implement MindCtxDocument

**Files:**
- Create: `packages/vscode/src/MindCtxDocument.ts`

- [ ] **Step 1: Write MindCtxDocument implementation**

```typescript
import * as vscode from 'vscode';
import { parse, serialize, applyPartialOperation, invertOperation, type MindCtxTree, type Operation, type PartialOperation } from '@mindctx/core';
import type { MindCtxSettings } from './types/messages.js';

interface MindCtxEdit {
  readonly operation: Operation;
}

export class MindCtxDocument implements vscode.CustomDocument {
  private _tree: MindCtxTree;
  private _content: string;
  private _fileHash: string;
  private _disposed = false;

  private readonly _onDidDispose = new vscode.EventEmitter<void>();
  public readonly onDidDispose = this._onDidDispose.event;

  private readonly _onDidChange = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<MindCtxEdit>>();
  public readonly onDidChange = this._onDidChange.event;

  private _saveTimeout: ReturnType<typeof setTimeout> | null = null;

  static async create(uri: vscode.Uri, settings: MindCtxSettings): Promise<MindCtxDocument> {
    const fileData = await vscode.workspace.fs.readFile(uri);
    const content = new TextDecoder().decode(fileData);
    return new MindCtxDocument(uri, content, settings);
  }

  private constructor(
    public readonly uri: vscode.Uri,
    content: string,
    private _settings: MindCtxSettings,
  ) {
    this._content = content;
    this._fileHash = this.computeHash(content);
    this._tree = parse(content, {
      filePath: uri.fsPath,
      defaultHeadingDepth: _settings.headingDepth,
    });
  }

  get tree(): MindCtxTree {
    return this._tree;
  }

  get content(): string {
    return this._content;
  }

  get fileHash(): string {
    return this._fileHash;
  }

  updateSettings(settings: Partial<MindCtxSettings>): void {
    Object.assign(this._settings, settings);
  }

  applyOperation(op: PartialOperation): { success: true; fullOp: Operation } | { success: false; error: string } {
    try {
      const fullOp = applyPartialOperation(this._tree, op);
      this._content = serialize(this._tree);

      this._onDidChange.fire({
        document: this,
        label: op.type,
        undo: async () => {
          const inverted = invertOperation(fullOp);
          for (const inv of inverted) {
            applyPartialOperation(this._tree, inv);
          }
          this._content = serialize(this._tree);
        },
        redo: async () => {
          applyPartialOperation(this._tree, fullOp);
          this._content = serialize(this._tree);
        },
      });

      return { success: true, fullOp };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async save(cancellation: vscode.CancellationToken): Promise<void> {
    this.cancelPendingSave();
    const encoded = new TextEncoder().encode(this._content);
    await vscode.workspace.fs.writeFile(this.uri, encoded);
    this._fileHash = this.computeHash(this._content);
  }

  async revert(cancellation: vscode.CancellationToken): Promise<void> {
    const fileData = await vscode.workspace.fs.readFile(this.uri);
    const content = new TextDecoder().decode(fileData);
    this._content = content;
    this._fileHash = this.computeHash(content);
    this._tree = parse(content, {
      filePath: this.uri.fsPath,
      defaultHeadingDepth: this._settings.headingDepth,
    });
  }

  scheduleSave(delay: number): void {
    this.cancelPendingSave();
    this._saveTimeout = setTimeout(async () => {
      this._saveTimeout = null;
      const encoded = new TextEncoder().encode(this._content);
      await vscode.workspace.fs.writeFile(this.uri, encoded);
      this._fileHash = this.computeHash(this._content);
    }, delay);
  }

  cancelPendingSave(): void {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
    }
  }

  get hasPendingSave(): boolean {
    return this._saveTimeout !== null;
  }

  async handleExternalChange(): Promise<MindCtxTree | null> {
    if (this.hasPendingSave) return null;

    const fileData = await vscode.workspace.fs.readFile(this.uri);
    const content = new TextDecoder().decode(fileData);
    const newHash = this.computeHash(content);

    if (newHash === this._fileHash) return null;

    this._content = content;
    this._fileHash = newHash;
    this._tree = parse(content, {
      filePath: this.uri.fsPath,
      defaultHeadingDepth: this._settings.headingDepth,
    });
    return this._tree;
  }

  private computeHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash.toString(36);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.cancelPendingSave();
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
    this._onDidChange.dispose();
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd packages/vscode && npx tsc --noEmit
```

Expected: No type errors (may need `@types/vscode` installed first via `pnpm install`).

- [ ] **Step 3: Commit**

```bash
git add packages/vscode/src/MindCtxDocument.ts
git commit -m "feat(vscode): implement MindCtxDocument with edit tracking and file I/O"
```

---

## Task 10: Implement MindCtxEditorProvider

**Files:**
- Create: `packages/vscode/src/MindCtxEditorProvider.ts`

- [ ] **Step 1: Write the provider implementation**

```typescript
import * as vscode from 'vscode';
import { MindCtxDocument } from './MindCtxDocument.js';
import type { ExtToWebview, WebviewToExt, MindCtxSettings, ThemeColors, PersistedViewState } from './types/messages.js';

export class MindCtxEditorProvider implements vscode.CustomEditorProvider<MindCtxDocument> {
  private static readonly viewType = 'mindctx.editor';

  private readonly _webviews = new Map<MindCtxDocument, Set<vscode.WebviewPanel>>();
  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<never>>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MindCtxEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      MindCtxEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: true,
      },
    );
  }

  // --- CustomEditorProvider implementation ---

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<MindCtxDocument> {
    const settings = this.getSettings();
    const document = await MindCtxDocument.create(uri, settings);

    const watcher = vscode.workspace.createFileSystemWatcher(uri.fsPath);
    const changeListener = watcher.onDidChange(async () => {
      const updatedTree = await document.handleExternalChange();
      if (updatedTree) {
        this.broadcastToAll(document, { type: 'treeUpdated', tree: updatedTree, reason: 'externalChange' });
      }
    });

    document.onDidDispose(() => {
      changeListener.dispose();
      watcher.dispose();
      this._webviews.delete(document);
    });

    return document;
  }

  async resolveCustomEditor(
    document: MindCtxDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Track webview
    if (!this._webviews.has(document)) {
      this._webviews.set(document, new Set());
    }
    this._webviews.get(document)!.add(webviewPanel);

    // Configure webview
    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Listen for messages from webview
    webviewPanel.webview.onDidReceiveMessage((msg: WebviewToExt) => {
      this.handleWebviewMessage(document, webviewPanel, msg);
    });

    // Clean up on dispose
    webviewPanel.onDidDispose(() => {
      this._webviews.get(document)?.delete(webviewPanel);
    });

    // Listen for document changes (edit events drive undo/redo)
    document.onDidChange((e) => {
      // Forward to VSCode's undo system — the event is already fired by MindCtxDocument
    });

    // Listen for theme changes
    vscode.window.onDidChangeActiveColorTheme((theme) => {
      this.postMessage(webviewPanel, {
        type: 'themeChanged',
        colors: this.getThemeColors(theme),
      });
    });
  }

  // --- CustomEditorProvider edit lifecycle ---

  public readonly onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<MindCtxDocument>>().event;

  async saveCustomDocument(document: MindCtxDocument, cancellation: vscode.CancellationToken): Promise<void> {
    await document.save(cancellation);
  }

  async saveCustomDocumentAs(document: MindCtxDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
    const encoded = new TextEncoder().encode(document.content);
    await vscode.workspace.fs.writeFile(destination, encoded);
  }

  async revertCustomDocument(document: MindCtxDocument, cancellation: vscode.CancellationToken): Promise<void> {
    await document.revert(cancellation);
    this.broadcastToAll(document, { type: 'treeUpdated', tree: document.tree, reason: 'externalChange' });
  }

  async backupCustomDocument(
    document: MindCtxDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    await this.saveCustomDocument(document, cancellation);
    return { id: context.destination.toString(), delete: () => {} };
  }

  // --- Message handling ---

  private handleWebviewMessage(document: MindCtxDocument, source: vscode.WebviewPanel, msg: WebviewToExt): void {
    switch (msg.type) {
      case 'ready': {
        const state = this.loadViewState(document.uri);
        this.postMessage(source, {
          type: 'init',
          tree: document.tree,
          settings: this.getSettings(),
          state,
        });
        break;
      }

      case 'operation': {
        const result = document.applyOperation(msg.op);
        if (result.success) {
          document.scheduleSave(this.getSettings().autoSaveDelay);
          // Broadcast to all webviews
          const panels = this._webviews.get(document);
          if (panels) {
            for (const panel of panels) {
              const reason = panel === source ? 'self' : 'peerEdit';
              this.postMessage(panel, { type: 'treeUpdated', tree: document.tree, reason });
            }
          }
        } else {
          this.postMessage(source, { type: 'error', message: result.error, operationId: msg.operationId });
          this.postMessage(source, { type: 'treeUpdated', tree: document.tree, reason: 'self' });
        }
        break;
      }

      case 'stateSync': {
        this.saveViewState(document.uri, {
          collapsedNodeIds: msg.state.collapsedNodeIds,
          activeView: msg.state.activeView,
        });
        break;
      }

      case 'exportResult': {
        this.handleExportResult(msg.format, msg.data);
        break;
      }

      case 'requestSave': {
        document.cancelPendingSave();
        vscode.commands.executeCommand('workbench.action.files.save');
        break;
      }
    }
  }

  // --- Helpers ---

  private postMessage(panel: vscode.WebviewPanel, msg: ExtToWebview): void {
    panel.webview.postMessage(msg);
  }

  private broadcastToAll(document: MindCtxDocument, msg: ExtToWebview): void {
    const panels = this._webviews.get(document);
    if (panels) {
      for (const panel of panels) {
        this.postMessage(panel, msg);
      }
    }
  }

  private getSettings(): MindCtxSettings {
    const config = vscode.workspace.getConfiguration('mindctx');
    return {
      defaultView: config.get('defaultView', 'outline'),
      headingDepth: config.get('headingDepth', 3),
      autoSaveDelay: config.get('autoSaveDelay', 300),
      outlineFontSize: config.get('outlineFontSize', 14),
      showNotePreview: config.get('showNotePreview', true),
      mindmapDirection: config.get('mindmapDirection', 'side'),
    };
  }

  private getThemeColors(theme: vscode.ColorTheme): ThemeColors {
    const kind = theme.kind === vscode.ColorThemeKind.Dark ? 'dark'
      : theme.kind === vscode.ColorThemeKind.HighContrast ? 'high-contrast'
      : 'light';
    return {
      kind,
      foreground: kind === 'dark' ? '#cccccc' : '#333333',
      background: kind === 'dark' ? '#1e1e1e' : '#ffffff',
      accent: kind === 'dark' ? '#569cd6' : '#0066b8',
      border: kind === 'dark' ? '#3c3c3c' : '#e0e0e0',
      nodeBackground: kind === 'dark' ? '#2d2d2d' : '#f5f5f5',
      selectedBackground: kind === 'dark' ? '#094771' : '#e8f0fe',
    };
  }

  private loadViewState(uri: vscode.Uri): PersistedViewState | null {
    const key = `mindctx:viewState:${uri.fsPath}`;
    return this.context.workspaceState.get<PersistedViewState>(key) ?? null;
  }

  private saveViewState(uri: vscode.Uri, state: PersistedViewState): void {
    const key = `mindctx:viewState:${uri.fsPath}`;
    this.context.workspaceState.update(key, state);
  }

  private async handleExportResult(format: 'png', data: string): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      filters: { 'PNG Image': ['png'] },
    });
    if (!uri) return;

    const base64 = data.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    await vscode.workspace.fs.writeFile(uri, buffer);
    vscode.window.showInformationMessage('Exported successfully.');
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css')
    );
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${cspSource}; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:; font-src ${cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>MindCtx</title>
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd packages/vscode && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/vscode/src/MindCtxEditorProvider.ts
git commit -m "feat(vscode): implement MindCtxEditorProvider with multi-webview sync"
```

---

## Task 11: Implement extension entry point

**Files:**
- Create: `packages/vscode/src/extension.ts`

- [ ] **Step 1: Write extension.ts**

```typescript
import * as vscode from 'vscode';
import { MindCtxEditorProvider } from './MindCtxEditorProvider.js';
import { exportOPML, exportJSON, copyAsAIContext, importOPML, importFreeMind, parse, serialize } from '@mindctx/core';

export function activate(context: vscode.ExtensionContext): void {
  // Register custom editor
  context.subscriptions.push(MindCtxEditorProvider.register(context));

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('mindctx.create', createNewFile),
    vscode.commands.registerCommand('mindctx.openAs', openWithMindCtx),
    vscode.commands.registerCommand('mindctx.import.opml', () => importFile('opml')),
    vscode.commands.registerCommand('mindctx.import.freemind', () => importFile('freemind')),
  );
}

export function deactivate(): void {}

async function createNewFile(): Promise<void> {
  const uri = await vscode.window.showSaveDialog({
    filters: { 'MindCtx': ['mind.md'] },
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
  });
  if (!uri) return;

  const template = `---\nmindctx: true\nheading-depth: 3\n---\n\n# New Document\n\n## Section 1\n\n- Item 1\n- Item 2\n`;
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(template));
  await vscode.commands.executeCommand('vscode.openWith', uri, 'mindctx.editor');
}

async function openWithMindCtx(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  await vscode.commands.executeCommand('vscode.openWith', editor.document.uri, 'mindctx.editor');
}

async function importFile(format: 'opml' | 'freemind'): Promise<void> {
  const filters = format === 'opml'
    ? { 'OPML': ['opml', 'xml'] }
    : { 'FreeMind': ['mm'] };

  const sourceUris = await vscode.window.showOpenDialog({ filters, canSelectMany: false });
  if (!sourceUris || sourceUris.length === 0) return;

  const fileData = await vscode.workspace.fs.readFile(sourceUris[0]);
  const text = new TextDecoder().decode(fileData);
  const fileName = sourceUris[0].path.split('/').pop() ?? 'import';

  let markdown: string;
  if (format === 'opml') {
    markdown = importOPML(text, fileName);
  } else {
    markdown = importFreeMind(text, fileName);
  }

  const destUri = await vscode.window.showSaveDialog({
    filters: { 'MindCtx': ['mind.md'] },
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
  });
  if (!destUri) return;

  await vscode.workspace.fs.writeFile(destUri, new TextEncoder().encode(markdown));
  await vscode.commands.executeCommand('vscode.openWith', destUri, 'mindctx.editor');
  vscode.window.showInformationMessage(`Imported ${fileName} successfully.`);
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd packages/vscode && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/vscode/src/extension.ts
git commit -m "feat(vscode): implement extension entry point with commands"
```

---

## Task 12: Implement WebviewBridge

**Files:**
- Create: `packages/vscode/src/webview/WebviewBridge.ts`

- [ ] **Step 1: Write WebviewBridge**

```typescript
import { signal, type Signal } from '@preact/signals';
import type { MindCtxTree, PartialOperation } from '@mindctx/core';
import type { ExtToWebview, WebviewToExt, MindCtxSettings, ThemeColors, PersistedViewState, TransientViewState, WebviewCommand } from '../types/messages.js';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
let operationCounter = 0;

export class WebviewBridge {
  readonly tree: Signal<MindCtxTree | null> = signal(null);
  readonly settings: Signal<MindCtxSettings> = signal({
    defaultView: 'outline',
    headingDepth: 3,
    autoSaveDelay: 300,
    outlineFontSize: 14,
    showNotePreview: true,
    mindmapDirection: 'side',
  });
  readonly theme: Signal<ThemeColors> = signal({
    kind: 'dark',
    foreground: '#cccccc',
    background: '#1e1e1e',
    accent: '#569cd6',
    border: '#3c3c3c',
    nodeBackground: '#2d2d2d',
    selectedBackground: '#094771',
  });
  readonly activeView: Signal<'outline' | 'mindmap'> = signal('outline');

  private _commandHandlers: Array<(cmd: WebviewCommand) => void> = [];

  constructor() {
    window.addEventListener('message', (event: MessageEvent<ExtToWebview>) => {
      this.handleMessage(event.data);
    });

    // Notify extension that webview is ready
    this.post({ type: 'ready' });
  }

  executeOperation(op: PartialOperation): void {
    const operationId = `op-${++operationCounter}`;
    this.post({ type: 'operation', op, operationId });
  }

  syncState(state: Partial<TransientViewState>): void {
    const full: TransientViewState = {
      collapsedNodeIds: state.collapsedNodeIds ?? [],
      selectedNodeId: state.selectedNodeId ?? null,
      activeView: state.activeView ?? this.activeView.value,
      scrollPosition: state.scrollPosition ?? 0,
    };
    this.post({ type: 'stateSync', state: full });
  }

  sendExportResult(format: 'png', data: string): void {
    this.post({ type: 'exportResult', format, data });
  }

  requestSave(): void {
    this.post({ type: 'requestSave' });
  }

  onCommand(handler: (cmd: WebviewCommand) => void): () => void {
    this._commandHandlers.push(handler);
    return () => {
      const idx = this._commandHandlers.indexOf(handler);
      if (idx >= 0) this._commandHandlers.splice(idx, 1);
    };
  }

  private handleMessage(msg: ExtToWebview): void {
    switch (msg.type) {
      case 'init':
        this.tree.value = msg.tree;
        this.settings.value = msg.settings;
        if (msg.state) {
          this.activeView.value = msg.state.activeView;
        }
        break;

      case 'treeUpdated':
        this.tree.value = msg.tree;
        break;

      case 'themeChanged':
        this.theme.value = msg.colors;
        break;

      case 'settingsChanged':
        this.settings.value = { ...this.settings.value, ...msg.settings };
        break;

      case 'command':
        for (const handler of this._commandHandlers) {
          handler(msg.command);
        }
        break;

      case 'error':
        console.warn('[MindCtx] Operation error:', msg.message);
        break;
    }
  }

  private post(msg: WebviewToExt): void {
    vscode.postMessage(msg);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/vscode/src/webview/WebviewBridge.ts
git commit -m "feat(vscode): implement WebviewBridge postMessage abstraction"
```

---

## Task 13: Implement Webview entry point (placeholder UI)

**Files:**
- Create: `packages/vscode/src/webview/index.tsx`
- Create: `packages/vscode/src/webview/App.tsx`

- [ ] **Step 1: Write index.tsx**

```tsx
import { h, render } from 'preact';
import { App } from './App.js';

const root = document.getElementById('root');
if (root) {
  render(<App />, root);
}
```

- [ ] **Step 2: Write App.tsx (placeholder that proves communication works)**

```tsx
import { h } from 'preact';
import { WebviewBridge } from './WebviewBridge.js';

const bridge = new WebviewBridge();

export function App() {
  const tree = bridge.tree.value;

  if (!tree) {
    return <div class="loading">Loading...</div>;
  }

  return (
    <div class="mindctx-root">
      <div class="placeholder">
        <h1>{tree.root.title}</h1>
        <p>Nodes: {tree.metadata.nodeCount} | Depth: {tree.metadata.maxDepth}</p>
        <p>View: {bridge.activeView.value}</p>
        <p style="opacity: 0.5;">Outline and Mind Map views coming in Phase 2-3.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/vscode/src/webview/
git commit -m "feat(vscode): add webview entry point with placeholder UI"
```

---

## Task 14: Create esbuild config for VSCode extension

**Files:**
- Create: `packages/vscode/esbuild.config.mjs`

- [ ] **Step 1: Write esbuild config that builds both extension and webview**

```javascript
import esbuild from 'esbuild';

const prod = process.argv.includes('production');
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  sourcemap: !prod,
  minify: prod,
  target: 'es2022',
  logLevel: 'info',
};

// Extension host bundle
const extensionBuild = esbuild.build({
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  format: 'cjs',
  platform: 'node',
  external: ['vscode'],
});

// Webview bundle
const webviewBuild = esbuild.build({
  ...shared,
  entryPoints: ['src/webview/index.tsx'],
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  define: {
    'process.env.NODE_ENV': prod ? '"production"' : '"development"',
  },
});

if (watch) {
  // In watch mode, use context API
  const extCtx = await esbuild.context({
    ...shared,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    format: 'cjs',
    platform: 'node',
    external: ['vscode'],
  });
  const webCtx = await esbuild.context({
    ...shared,
    entryPoints: ['src/webview/index.tsx'],
    outfile: 'dist/webview.js',
    format: 'iife',
    platform: 'browser',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    define: {
      'process.env.NODE_ENV': '"development"',
    },
  });
  await Promise.all([extCtx.watch(), webCtx.watch()]);
} else {
  await Promise.all([extensionBuild, webviewBuild]);
}
```

- [ ] **Step 2: Test the build**

```bash
cd packages/vscode && pnpm install && pnpm run build
```

Expected: `dist/extension.js` and `dist/webview.js` generated.

- [ ] **Step 3: Commit**

```bash
git add packages/vscode/esbuild.config.mjs
git commit -m "feat(vscode): add esbuild config for extension + webview bundles"
```

---

## Task 15: End-to-end smoke test

**Files:**
- Verify: Full monorepo builds
- Verify: Extension loads in VSCode

- [ ] **Step 1: Install all dependencies**

```bash
pnpm install
```

- [ ] **Step 2: Build entire monorepo**

```bash
pnpm -r build
```

Expected: All packages build successfully:
- `packages/core/dist/index.js` + `index.cjs` + `index.d.ts`
- `packages/obsidian/main.js`
- `packages/vscode/dist/extension.js` + `dist/webview.js`

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

Expected: All 125 tests pass.

- [ ] **Step 4: Verify extension can be launched**

```bash
cd packages/vscode
code --extensionDevelopmentPath=$(pwd) --new-window
```

Expected: VSCode opens. Creating a `.mind.md` file shows the MindCtx placeholder UI with document title and node count.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(vscode): complete Phase 0-1 - monorepo + extension skeleton"
```

---

## Summary

After completing this plan:
- Project is restructured as a pnpm monorepo
- `@mindctx/core` is a standalone package with all shared logic
- `packages/obsidian` consumes core and builds as before (artifact structure unchanged)
- `packages/vscode` has a working Custom Editor that:
  - Opens `.mind.md` files
  - Parses Markdown into tree
  - Displays placeholder UI in Webview
  - Has working postMessage communication (WebviewBridge)
  - Supports file read/write with debounced saves
  - Handles undo/redo via VSCode edit tracking
  - Manages multiple webview panels per document
  - Registers all commands (with stubs for view-dependent ones)
- All 125 existing tests still pass

**Next plan needed:** Phase 2-6 (Outline view, Mind Map view, full commands, theme, polish, tests).
