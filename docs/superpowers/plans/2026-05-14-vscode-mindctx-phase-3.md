# VSCode MindCtx Phase 3: Mind Map View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Mind Elixir-based mind map view to the VSCode extension webview, providing full drag-and-drop node manipulation, zoom controls, focus mode, context menu, and keyboard shortcuts.

**Architecture:** The MindMapView uses Mind Elixir for rendering. The `@mindctx/core/bridge` subpath already exports the data conversion and event wiring. We need a VSCode-specific theme bridge (replacing the Obsidian theme bridge) and adapt the component to use WebviewBridge signals.

**Tech Stack:** Preact, Mind Elixir v4, @mindctx/core/bridge (treeToMindElixirData, setupMindElixirEvents, syncMindElixirAddChildButtons, getMindElixirDirection)

---

## File Structure

```
packages/vscode/src/webview/
├── MindMapView.tsx          ← Port from obsidian (bridge + theme adaptation)
├── App.tsx                  ← Update to render MindMapView when active
├── bridge/
│   └── mindElixirTheme.ts   ← VSCode theme bridge (replaces Obsidian version)
└── styles/
    └── mindmap.css          ← Mind map specific styles
```

---

## Task 1: Create VSCode mind map theme bridge

**Files:**
- Create: `packages/vscode/src/webview/bridge/mindElixirTheme.ts`

Adapts the Obsidian theme bridge to use VSCode's CSS variables (exposed via the `ThemeColors` sent from the extension host). In VSCode webviews, CSS variables like `--vscode-*` are available directly.

- [ ] **Step 1: Create mindElixirTheme.ts**

```typescript
import type { ThemeColors } from '../../types/messages.js';

export function getVSCodeTheme(colors: ThemeColors): Record<string, string> {
  return {
    '--main-color': colors.foreground,
    '--main-bgcolor': colors.background,
    '--color': colors.foreground,
    '--bgcolor': colors.nodeBackground,
    '--selected': colors.accent,
    '--root-color': colors.kind === 'dark' ? '#ffffff' : '#ffffff',
    '--root-bgcolor': colors.accent,
  };
}

export function applyTheme(container: HTMLElement, theme: Record<string, string>): void {
  for (const [key, value] of Object.entries(theme)) {
    container.style.setProperty(key, value);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/vscode/src/webview/bridge/
git commit -m "feat(vscode): add mind map theme bridge for VSCode"
```

---

## Task 2: Create MindMapView component

**Files:**
- Create: `packages/vscode/src/webview/MindMapView.tsx`

Port from `packages/obsidian/src/views/MindMapView.tsx`. Key adaptations:
- Takes `bridge: WebviewBridge` instead of callback props
- Calls `bridge.executeOperation(op)` instead of `onOperation(op)`
- No `onUndo`/`onRedo` (handled by VSCode natively)
- Uses `bridge.theme.value` for theme colors instead of reading Obsidian CSS variables
- Uses `bridge.settings.value.mindmapDirection` for direction
- Syncs collapsed state via `bridge.syncState()` instead of `onCollapsedChange`

- [ ] **Step 1: Create MindMapView.tsx**

```tsx
import { h, type JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Signal } from '@preact/signals';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance, NodeObj, Topic } from 'mind-elixir';
import {
  getMindElixirDirection,
  treeToMindElixirData,
  setupMindElixirEvents,
  syncMindElixirAddChildButtons,
} from '@mindctx/core/bridge';
import { findNode } from '@mindctx/core';
import type { MindCtxTree, PartialOperation, MindMapDirection } from '@mindctx/core';
import type { WebviewBridge } from './WebviewBridge.js';
import { getVSCodeTheme, applyTheme } from './bridge/mindElixirTheme.js';

interface MindMapViewProps {
  bridge: WebviewBridge;
  collapsedIds: Signal<Set<string>>;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 4.0;
const SCALE_STEP = 0.1;

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function normalizeScale(scale: number): number {
  return Math.round(clampScale(scale) * 10) / 10;
}

interface ZoomControlsProps {
  scale: number;
  onScaleChange: (scale: number) => void;
  onCenter: () => void;
}

function ZoomControls({ scale, onScaleChange, onCenter }: ZoomControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const percentage = Math.round(scale * 100);

  const handleSliderInput = (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    onScaleChange(Number(event.currentTarget.value) / 100);
  };

  return (
    <div
      class="mindctx-mindmap-zoom-controls"
      onMouseLeave={() => setIsOpen(false)}
    >
      {isOpen && (
        <div class="mindctx-mindmap-zoom-panel">
          <button
            type="button"
            class="mindctx-mindmap-center-button"
            onClick={onCenter}
            title="Center on root"
            aria-label="Center on root"
          >
            <svg
              class="mindctx-mindmap-center-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 9V4h5" />
              <path d="M15 4h5v5" />
              <path d="M20 15v5h-5" />
              <path d="M9 20H4v-5" />
              <circle cx="12" cy="12" r="1.6" />
            </svg>
          </button>
          <input
            type="range"
            class="mindctx-mindmap-zoom-slider"
            min="10"
            max="400"
            value={String(percentage)}
            onInput={handleSliderInput}
            onChange={handleSliderInput}
            aria-label="Zoom level"
          />
        </div>
      )}
      <button
        type="button"
        class="mindctx-mindmap-zoom-value"
        onMouseEnter={() => setIsOpen(true)}
        aria-expanded={isOpen}
      >
        {percentage}%
      </button>
    </div>
  );
}

export function MindMapView({ bridge, collapsedIds }: MindMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<MindElixirInstance | null>(null);
  const scaleRef = useRef(1.0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const isInternalUpdate = useRef(false);
  const collapsedIdsRef = useRef(collapsedIds.value);
  const treeIdRef = useRef<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [currentScale, setCurrentScale] = useState(1.0);

  collapsedIdsRef.current = collapsedIds.value;

  const tree = bridge.tree.value;
  const direction = bridge.settings.value.mindmapDirection as MindMapDirection;
  const themeColors = bridge.theme.value;

  const wrappedOnOperation = (op: PartialOperation) => {
    isInternalUpdate.current = true;
    bridge.executeOperation(op);
    queueMicrotask(() => { isInternalUpdate.current = false; });
  };

  const onCollapsedChange = (ids: Set<string>) => {
    collapsedIds.value = ids;
    bridge.syncState({ collapsedNodeIds: Array.from(ids) });
  };

  const enterFocusedNode = () => {
    const nodeObj = (instanceRef.current?.currentNode as unknown as { nodeObj?: NodeObj } | null)?.nodeObj;
    if (nodeObj) {
      setFocusNodeId(nodeObj.id);
    }
  };

  const closeContextMenu = (event: MouseEvent) => {
    const target = event.currentTarget;
    if (target instanceof HTMLElement) {
      const menu = target.closest('.context-menu') as HTMLElement | null;
      if (menu) menu.hidden = true;
    }
  };

  const applyScale = (nextScale: number) => {
    const normalizedScale = normalizeScale(nextScale);
    scaleRef.current = normalizedScale;
    setCurrentScale(normalizedScale);
    instanceRef.current?.scale(normalizedScale);
  };

  const handleWheel = (event: JSX.TargetedWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP;
    applyScale(scaleRef.current + delta);
  };

  const handleCenter = () => {
    applyScale(1.0);
    instanceRef.current?.toCenter();
  };

  useEffect(() => {
    if (!containerRef.current || !tree) return;

    const currentTreeId = tree.filePath;
    if (instanceRef.current && treeIdRef.current === currentTreeId) return;

    if (instanceRef.current) {
      cleanupRef.current?.();
      instanceRef.current.destroy();
      instanceRef.current = null;
    }
    treeIdRef.current = currentTreeId;

    const me = new MindElixir({
      el: containerRef.current,
      direction: getMindElixirDirection(direction),
      draggable: true,
      selectionContainer: containerRef.current.ownerDocument.body,
      contextMenu: {
        focus: false,
        link: false,
        extend: [
          {
            name: 'Focus this node',
            onclick: (event: MouseEvent) => {
              closeContextMenu(event);
              enterFocusedNode();
            },
          },
        ],
      },
      toolBar: false,
      keypress: false,
      locale: 'en' as const,
    });

    applyTheme(containerRef.current, getVSCodeTheme(themeColors));

    const data = treeToMindElixirData(tree, collapsedIds.value, direction, focusNodeId);
    me.init(data);
    scaleRef.current = 1.0;
    setCurrentScale(1.0);
    syncMindElixirAddChildButtons(me);

    const addButtonObserver = new MutationObserver(() => {
      syncMindElixirAddChildButtons(me);
    });
    addButtonObserver.observe(containerRef.current, { childList: true, subtree: true });

    cleanupRef.current = setupMindElixirEvents(me, wrappedOnOperation, onCollapsedChange, () => collapsedIdsRef.current);
    instanceRef.current = me;

    return () => {
      cleanupRef.current?.();
      addButtonObserver.disconnect();
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
      treeIdRef.current = null;
    };
  }, [tree?.filePath, direction]);

  useEffect(() => {
    setFocusNodeId(null);
  }, [tree?.filePath]);

  useEffect(() => {
    if (!tree || !focusNodeId) return;
    if (!findNode(tree.root, focusNodeId)) {
      setFocusNodeId(null);
    }
  }, [tree, focusNodeId]);

  useEffect(() => {
    if (!instanceRef.current || !tree) return;
    if (isInternalUpdate.current) return;
    instanceRef.current.direction = getMindElixirDirection(direction);
    const data = treeToMindElixirData(tree, collapsedIds.value, direction, focusNodeId);
    instanceRef.current.refresh(data);
    syncMindElixirAddChildButtons(instanceRef.current);
  }, [tree, collapsedIds.value, direction, focusNodeId]);

  useEffect(() => {
    if (!containerRef.current) return;
    applyTheme(containerRef.current, getVSCodeTheme(themeColors));
  }, [themeColors]);

  const handleKeyDown = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const me = instanceRef.current;
    if (!me) return;

    const selectedNode = me.currentNode;

    if (e.key === 'Tab' && selectedNode) {
      e.preventDefault();
      void me.addChild(selectedNode as Topic);
    } else if (e.key === 'Enter' && selectedNode) {
      e.preventDefault();
      const nodeObj = (selectedNode as unknown as { nodeObj?: NodeObj }).nodeObj;
      if (nodeObj?.parent) {
        bridge.executeOperation({
          type: 'create',
          parentId: nodeObj.parent.id,
          index: -1,
          title: 'New node',
        });
      }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode) {
      e.preventDefault();
      const nodeObj = (selectedNode as unknown as { nodeObj?: NodeObj }).nodeObj;
      if (nodeObj?.parent) {
        bridge.executeOperation({ type: 'delete', nodeId: nodeObj.id });
      }
    } else if (e.key === 'F2' && selectedNode) {
      e.preventDefault();
      void me.beginEdit(selectedNode);
    }
  };

  const focusedNode = tree && focusNodeId ? findNode(tree.root, focusNodeId) : null;

  return (
    <div class="mindctx-mindmap-shell">
      {focusedNode && (
        <div class="mindctx-mindmap-focusbar">
          <span class="mindctx-mindmap-focusbar-label">Focused: {focusedNode.title || '(empty)'}</span>
          <button
            type="button"
            class="mindctx-mindmap-focusbar-button"
            onClick={() => setFocusNodeId(null)}
          >
            Exit Focus
          </button>
        </div>
      )}
      <ZoomControls
        scale={currentScale}
        onScaleChange={applyScale}
        onCenter={handleCenter}
      />
      <div
        ref={containerRef}
        class="mindctx-mindmap-container"
        style={{ width: '100%', height: '100%' }}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/vscode/src/webview/MindMapView.tsx
git commit -m "feat(vscode): add MindMapView with Mind Elixir integration"
```

---

## Task 3: Create mind map CSS

**Files:**
- Create: `packages/vscode/src/webview/styles/mindmap.css`

Port the mind map specific styles from Obsidian, mapping to VSCode CSS variables.

- [ ] **Step 1: Create mindmap.css**

```css
.mindctx-mindmap-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--vscode-editor-background);
}

.mindctx-mindmap-focusbar {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 16px);
  padding: 6px 8px;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
  background: var(--vscode-editor-background);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.mindctx-mindmap-focusbar-label {
  min-width: 0;
  max-width: 320px;
  overflow: hidden;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mindctx-mindmap-focusbar-button {
  flex: 0 0 auto;
  padding: 2px 8px;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  font-size: 12px;
  cursor: pointer;
}

.mindctx-mindmap-focusbar-button:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.mindctx-mindmap-zoom-controls {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 20;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.mindctx-mindmap-zoom-panel {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
  background: var(--vscode-editor-background);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.mindctx-mindmap-zoom-slider {
  width: 120px;
  height: 28px;
  margin: 0;
  accent-color: var(--vscode-focusBorder);
  cursor: pointer;
}

.mindctx-mindmap-zoom-value,
.mindctx-mindmap-center-button {
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  background: var(--vscode-editor-background);
  color: var(--vscode-foreground);
  font-size: 12px;
  cursor: pointer;
}

.mindctx-mindmap-zoom-value {
  min-width: 48px;
  height: 28px;
  padding: 0 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.mindctx-mindmap-center-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.mindctx-mindmap-center-icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.mindctx-mindmap-center-icon circle {
  fill: currentColor;
  stroke: none;
}

.mindctx-mindmap-zoom-value:hover,
.mindctx-mindmap-center-button:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.mindctx-mindmap-container {
  flex: 1;
  min-height: 0;
  background: var(--vscode-editor-background);
  overflow: hidden;
}

.mindctx-mindmap-container me-root {
  font-size: 18px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
}

.mindctx-mindmap-container me-wrapper .node-content {
  font-family: var(--vscode-font-family);
  font-size: 14px;
  padding: 4px 10px;
  border-radius: 4px;
}

.mindctx-mindmap-container me-tpc {
  position: relative;
}

.mindctx-mindmap-container me-tpc .mindctx-mindmap-add-child {
  position: absolute;
  top: 50%;
  right: -22px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  min-width: 18px;
  min-height: 18px;
  padding: 0;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 50%;
  background: var(--vscode-editor-background);
  color: var(--vscode-descriptionForeground);
  font-size: 14px;
  line-height: 16px;
  font-weight: 600;
  opacity: 0;
  cursor: pointer;
  pointer-events: auto;
  transition: opacity 120ms ease, color 120ms ease, background-color 120ms ease, border-color 120ms ease;
  z-index: 10;
}

.mindctx-mindmap-container .lhs me-tpc .mindctx-mindmap-add-child {
  right: auto;
  left: -22px;
}

.mindctx-mindmap-container me-tpc:hover .mindctx-mindmap-add-child,
.mindctx-mindmap-container me-tpc.selected .mindctx-mindmap-add-child {
  opacity: 1;
}

.mindctx-mindmap-container me-tpc .mindctx-mindmap-add-child:hover {
  background: var(--vscode-focusBorder);
  border-color: var(--vscode-focusBorder);
  color: #ffffff;
}
```

- [ ] **Step 2: Import in index.tsx**

Update `packages/vscode/src/webview/index.tsx` to import the mindmap CSS:

```tsx
import './styles/outline.css';
import './styles/mindmap.css';
import { h, render } from 'preact';
import { App } from './App.js';

const root = document.getElementById('root');
if (root) {
  render(<App />, root);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/vscode/src/webview/styles/mindmap.css packages/vscode/src/webview/index.tsx
git commit -m "feat(vscode): add mind map CSS with VSCode theme variables"
```

---

## Task 4: Update App.tsx to integrate MindMapView

**Files:**
- Modify: `packages/vscode/src/webview/App.tsx`

Replace the mind map placeholder with the actual MindMapView component. Also handle the `export.png` command.

- [ ] **Step 1: Update App.tsx**

Add `MindMapView` import and replace the placeholder in the view conditional:

```tsx
import { MindMapView } from './MindMapView.js';
```

Replace the mindmap placeholder block:
```tsx
// Before:
<div class="mindctx-loading">Mind Map view coming in Phase 3.</div>

// After:
<MindMapView bridge={bridge} collapsedIds={collapsedIds} />
```

Also add `export.png` to the command handler (no-op for now, will be implemented in Phase 4 with html-to-image):

```tsx
case 'export.png':
  // PNG export handled in Phase 4
  break;
```

- [ ] **Step 2: Commit**

```bash
git add packages/vscode/src/webview/App.tsx
git commit -m "feat(vscode): integrate MindMapView in App layout"
```

---

## Task 5: Build verification

**Files:**
- Verify: Full build works with Mind Elixir bundled

- [ ] **Step 1: Build all packages**

```bash
pnpm --filter @mindctx/core build
pnpm --filter vscode-mindctx build
```

Expected: Both extension.js and webview.js build without errors. The webview.js will be larger now (~150-200KB) due to Mind Elixir being bundled in.

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Expected: All 125 tests pass.

- [ ] **Step 3: Verify output**

```bash
ls -la packages/vscode/dist/
```

Expected:
- `extension.js` ~300KB
- `webview.js` ~150-200KB (includes Mind Elixir)
- `webview.css` ~7-8KB (outline + mindmap styles)

---

## Summary

Phase 3 adds the full mind map view:

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | VSCode theme bridge for Mind Elixir | 2 min |
| 2 | MindMapView component (full port) | 5 min |
| 3 | Mind map CSS + import | 3 min |
| 4 | App.tsx integration | 2 min |
| 5 | Build verification | 3 min |

After Phase 3, the extension provides:
- Full mind map rendering with Mind Elixir
- Drag-and-drop node reordering in mind map
- Right-click context menu (add child, delete, focus node)
- "+" button on nodes for quick child creation
- Zoom controls (Ctrl+scroll, slider, percentage display)
- Focus mode (drill into subtree, exit button)
- Keyboard shortcuts (Tab=add child, Enter=sibling, Delete, F2=edit)
- View switching between outline and mind map
- Theme-aware coloring from VSCode theme
