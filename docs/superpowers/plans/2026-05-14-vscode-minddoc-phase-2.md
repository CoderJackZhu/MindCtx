# VSCode MindDoc Phase 2: Outline View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the complete Outline View from the Obsidian plugin to the VSCode extension webview, providing full editing capability (keyboard shortcuts, drag-and-drop, inline editing, search, detail panel).

**Architecture:** Replace the placeholder `App.tsx` with the full MindDoc layout (toolbar + outline view + detail panel). All components are pure Preact — they need only interface adaptation (signals from WebviewBridge instead of props). CSS uses VSCode CSS variables instead of Obsidian's.

**Tech Stack:** Preact, @preact/signals, @minddoc/core (findNode, findParent, findIndex), WebviewBridge (existing)

---

## File Structure

```
packages/vscode/src/webview/
├── App.tsx                  ← Replace placeholder with full layout
├── OutlineView.tsx          ← Port from obsidian (bridge adaptation)
├── index.tsx                ← Unchanged
├── WebviewBridge.ts         ← Unchanged
├── components/
│   ├── OutlineNode.tsx      ← Copy verbatim (pure Preact)
│   ├── InlineEditor.tsx     ← Copy verbatim
│   ├── DragIndicator.tsx    ← Copy verbatim
│   ├── SearchBar.tsx        ← Copy verbatim
│   ├── DetailPanel.tsx      ← Copy verbatim
│   ├── ViewSwitcher.tsx     ← Copy verbatim
│   └── OutlineToolbar.tsx   ← Copy verbatim
└── styles/
    └── outline.css          ← Adapted from obsidian/styles.css
```

---

## Task 1: Create component files (pure Preact, no adaptation needed)

**Files:**
- Create: `packages/vscode/src/webview/components/OutlineNode.tsx`
- Create: `packages/vscode/src/webview/components/InlineEditor.tsx`
- Create: `packages/vscode/src/webview/components/DragIndicator.tsx`
- Create: `packages/vscode/src/webview/components/SearchBar.tsx`
- Create: `packages/vscode/src/webview/components/DetailPanel.tsx`
- Create: `packages/vscode/src/webview/components/ViewSwitcher.tsx`
- Create: `packages/vscode/src/webview/components/OutlineToolbar.tsx`

These 7 components are pure Preact with no Obsidian dependencies. Copy them verbatim from `packages/obsidian/src/views/components/`, only adjusting import paths.

- [ ] **Step 1: Create DragIndicator.tsx**

```tsx
import { h } from 'preact';

interface DragIndicatorProps {
  position: 'before' | 'after' | null;
}

export function DragIndicator({ position }: DragIndicatorProps) {
  if (!position) return null;
  return <div class={`minddoc-drop-line ${position}`} />;
}
```

- [ ] **Step 2: Create InlineEditor.tsx**

```tsx
import { h } from 'preact';
import { useRef, useEffect } from 'preact/hooks';

interface InlineEditorProps {
  value: string;
  onConfirm: (newValue: string) => void;
  onCancel: () => void;
}

export function InlineEditor({ value, onConfirm, onCancel }: InlineEditorProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      class="minddoc-inline-editor"
      value={value}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onConfirm((e.target as HTMLInputElement).value);
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
        e.stopPropagation();
      }}
      onBlur={(e) => onConfirm((e.target as HTMLInputElement).value)}
    />
  );
}
```

- [ ] **Step 3: Create SearchBar.tsx**

```tsx
import { h } from 'preact';

interface SearchBarProps {
  value: string;
  onChange: (query: string) => void;
  onClose: () => void;
  matchCount: number;
}

export function SearchBar({ value, onChange, onClose, matchCount }: SearchBarProps) {
  return (
    <div class="minddoc-search-bar">
      <input
        type="text"
        class="minddoc-search-input"
        placeholder="Search nodes..."
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        autoFocus
      />
      {value && (
        <span class="minddoc-search-count">{matchCount} matches</span>
      )}
      <button class="minddoc-search-close" onClick={onClose} title="Close search">×</button>
    </div>
  );
}
```

- [ ] **Step 4: Create ViewSwitcher.tsx**

```tsx
import { h } from 'preact';

interface ViewSwitcherProps {
  currentView: 'outline' | 'mindmap';
  onSwitch: (view: 'outline' | 'mindmap') => void;
}

export function ViewSwitcher({ currentView, onSwitch }: ViewSwitcherProps) {
  return (
    <div class="minddoc-view-switcher">
      <button
        class={`minddoc-switch-btn ${currentView === 'outline' ? 'is-active' : ''}`}
        onClick={() => onSwitch('outline')}
        title="Outline view"
      >
        Outline
      </button>
      <button
        class={`minddoc-switch-btn ${currentView === 'mindmap' ? 'is-active' : ''}`}
        onClick={() => onSwitch('mindmap')}
        title="Mind map view"
      >
        Mind Map
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Create OutlineToolbar.tsx**

```tsx
import { h } from 'preact';
import { ViewSwitcher } from './ViewSwitcher.js';

interface OutlineToolbarProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  currentView?: 'outline' | 'mindmap';
  onSwitchView?: (view: 'outline' | 'mindmap') => void;
}

export function OutlineToolbar({ onExpandAll, onCollapseAll, currentView, onSwitchView }: OutlineToolbarProps) {
  return (
    <div class="minddoc-toolbar">
      <button
        class="minddoc-toolbar-btn"
        onClick={onExpandAll}
        title="Expand all"
      >
        Expand All
      </button>
      <button
        class="minddoc-toolbar-btn"
        onClick={onCollapseAll}
        title="Collapse all"
      >
        Collapse All
      </button>
      <div style={{ flex: 1 }} />
      {currentView && onSwitchView && (
        <ViewSwitcher currentView={currentView} onSwitch={onSwitchView} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create OutlineNode.tsx**

```tsx
import { h } from 'preact';
import type { MindDocNode } from '@minddoc/core';
import { InlineEditor } from './InlineEditor.js';
import { DragIndicator } from './DragIndicator.js';

interface OutlineNodeProps {
  node: MindDocNode;
  depth: number;
  isSelected: boolean;
  isEditing: boolean;
  isCollapsed: boolean;
  indentSize: number;
  showNotePreview: boolean;
  dropPosition: 'before' | 'after' | 'child' | null;
  highlightQuery?: string;
  onSelect: () => void;
  onToggleCollapse: () => void;
  onStartEdit: () => void;
  onEndEdit: (newTitle: string) => void;
  onCancelEdit: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
}

function HighlightedTitle({ title, query }: { title: string; query: string }) {
  if (!query) return <span class="minddoc-title">{title}</span>;
  const lowerTitle = title.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerTitle.indexOf(lowerQuery);
  if (idx === -1) return <span class="minddoc-title">{title}</span>;

  return (
    <span class="minddoc-title">
      {title.slice(0, idx)}
      <mark class="minddoc-highlight">{title.slice(idx, idx + query.length)}</mark>
      {title.slice(idx + query.length)}
    </span>
  );
}

export function OutlineNode({
  node,
  depth,
  isSelected,
  isEditing,
  isCollapsed,
  indentSize,
  showNotePreview,
  dropPosition,
  highlightQuery,
  onSelect,
  onToggleCollapse,
  onStartEdit,
  onEndEdit,
  onCancelEdit,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onKeyDown,
}: OutlineNodeProps) {
  const hasChildren = node.children.length > 0;
  const paddingLeft = depth * indentSize;

  let className = 'minddoc-node';
  if (isSelected) className += ' is-selected';
  if (dropPosition === 'child') className += ' drop-highlight';

  return (
    <div
      class={className}
      style={{ paddingLeft: `${paddingLeft}px` }}
      onClick={onSelect}
      onDblClick={onStartEdit}
      onKeyDown={onKeyDown}
      draggable={!isEditing}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      tabIndex={0}
    >
      {dropPosition === 'before' && <DragIndicator position="before" />}

      <span class="minddoc-collapse-btn" onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}>
        {hasChildren ? (isCollapsed ? '▸' : '▾') : ' '}
      </span>

      <span class="minddoc-drag-handle">⋮⋮</span>

      {node.checked !== null ? (
        <input
          type="checkbox"
          class="minddoc-checkbox"
          checked={node.checked}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span class="minddoc-bullet" />
      )}

      {isEditing ? (
        <InlineEditor
          value={node.title}
          onConfirm={onEndEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        <HighlightedTitle title={node.title} query={highlightQuery || ''} />
      )}

      {!isEditing && showNotePreview && node.note && (
        <span class="minddoc-note-preview">{node.note.slice(0, 50)}</span>
      )}

      {dropPosition === 'after' && <DragIndicator position="after" />}
    </div>
  );
}
```

- [ ] **Step 7: Create DetailPanel.tsx**

```tsx
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { MindDocNode } from '@minddoc/core';

interface DetailPanelProps {
  node: MindDocNode | null;
  onUpdateNote: (nodeId: string, newNote: string) => void;
}

export function DetailPanel({ node, onUpdateNote }: DetailPanelProps) {
  if (!node) return null;

  const [localNote, setLocalNote] = useState(node.note);

  useEffect(() => {
    setLocalNote(node.note);
  }, [node.id, node.note]);

  return (
    <div class="minddoc-detail-panel">
      <div class="minddoc-detail-note">
        <textarea
          value={localNote}
          placeholder="Add note..."
          onInput={(e) => setLocalNote((e.target as HTMLTextAreaElement).value)}
          onBlur={(e) => {
            if ((e.target as HTMLTextAreaElement).value !== node.note) {
              onUpdateNote(node.id, (e.target as HTMLTextAreaElement).value);
            }
          }}
        />
      </div>
      {node.blocks.length > 0 && (
        <div class="minddoc-detail-blocks">
          {node.blocks.map((block, i) => (
            <pre key={i} class={`minddoc-block minddoc-block-${block.type}`}>
              <code>{block.raw}</code>
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add packages/vscode/src/webview/components/
git commit -m "feat(vscode): add outline view components (pure Preact ports)"
```

---

## Task 2: Create OutlineView.tsx (adapted for WebviewBridge)

**Files:**
- Create: `packages/vscode/src/webview/OutlineView.tsx`

The main outline view component. Adapted from `packages/obsidian/src/views/OutlineView.tsx`:
- Replaces Signal props with bridge signals
- Replaces `onOperation` with `bridge.executeOperation`
- Removes `onUndo`/`onRedo` (VSCode handles undo natively via Ctrl+Z → extension host)
- Uses local signals for `collapsedIds`, `selectedNodeId`, `editingNodeId` (synced to bridge)

- [ ] **Step 1: Create OutlineView.tsx**

```tsx
import { h, Fragment } from 'preact';
import { useState, useCallback, useMemo } from 'preact/hooks';
import { signal, type Signal } from '@preact/signals';
import { findNode, findParent, findIndex } from '@minddoc/core';
import type { MindDocTree, MindDocNode, PartialOperation } from '@minddoc/core';
import { OutlineNode } from './components/OutlineNode.js';
import { SearchBar } from './components/SearchBar.js';
import type { WebviewBridge } from './WebviewBridge.js';

interface OutlineViewProps {
  bridge: WebviewBridge;
  collapsedIds: Signal<Set<string>>;
  selectedNodeId: Signal<string | null>;
  editingNodeId: Signal<string | null>;
}

interface DragState {
  draggedId: string;
  targetId: string | null;
  position: 'before' | 'after' | 'child' | null;
}

function getVisibleNodes(root: MindDocNode, collapsedIds: Set<string>): MindDocNode[] {
  const result: MindDocNode[] = [];
  function walk(node: MindDocNode) {
    result.push(node);
    if (!collapsedIds.has(node.id)) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }
  for (const child of root.children) {
    walk(child);
  }
  return result;
}

function filterTree(root: MindDocNode, query: string): Set<string> {
  const visibleIds = new Set<string>();
  const lowerQuery = query.toLowerCase();

  function walk(node: MindDocNode, ancestors: string[]): boolean {
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

function countMatches(root: MindDocNode, query: string): number {
  const lowerQuery = query.toLowerCase();
  let count = 0;
  function walk(node: MindDocNode) {
    if (node.title.toLowerCase().includes(lowerQuery)) count++;
    node.children.forEach(walk);
  }
  walk(root);
  return count;
}

function isDescendant(root: MindDocNode, ancestorId: string, nodeId: string): boolean {
  const ancestor = findNode(root, ancestorId);
  if (!ancestor) return false;
  function check(node: MindDocNode): boolean {
    if (node.id === nodeId) return true;
    return node.children.some(check);
  }
  return check(ancestor);
}

function getDropPosition(e: DragEvent, el: HTMLElement): 'before' | 'after' | 'child' {
  const rect = el.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const height = rect.height;
  if (y < height * 0.25) return 'before';
  if (y > height * 0.75) return 'after';
  return 'child';
}

export function OutlineView({
  bridge,
  collapsedIds,
  selectedNodeId,
  editingNodeId,
}: OutlineViewProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const tree = bridge.tree.value;
  if (!tree) return <div class="minddoc-outline">Loading...</div>;

  const filterIds = useMemo(
    () => searchQuery ? filterTree(tree.root, searchQuery) : null,
    [tree, searchQuery]
  );

  const matchCount = useMemo(
    () => searchQuery ? countMatches(tree.root, searchQuery) : 0,
    [tree, searchQuery]
  );

  const visibleNodes = useMemo(
    () => getVisibleNodes(tree.root, collapsedIds.value),
    [tree, collapsedIds.value]
  );

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    const nodeId = selectedNodeId.value;

    if (meta && e.key === 'f') {
      e.preventDefault();
      setShowSearch(true);
      return;
    }

    if (editingNodeId.value) return;

    if (e.key === 'ArrowUp' && !meta && nodeId) {
      e.preventDefault();
      const idx = visibleNodes.findIndex(n => n.id === nodeId);
      if (idx > 0) selectedNodeId.value = visibleNodes[idx - 1].id;
      return;
    }
    if (e.key === 'ArrowDown' && !meta && nodeId) {
      e.preventDefault();
      const idx = visibleNodes.findIndex(n => n.id === nodeId);
      if (idx < visibleNodes.length - 1) selectedNodeId.value = visibleNodes[idx + 1].id;
      return;
    }
    if (meta && e.key === 'ArrowUp' && nodeId) {
      e.preventDefault();
      bridge.executeOperation({ type: 'moveUp', nodeId });
      return;
    }
    if (meta && e.key === 'ArrowDown' && nodeId) {
      e.preventDefault();
      bridge.executeOperation({ type: 'moveDown', nodeId });
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey && nodeId) {
      e.preventDefault();
      e.stopPropagation();
      bridge.executeOperation({ type: 'indent', nodeId });
      return;
    }
    if (e.key === 'Tab' && e.shiftKey && nodeId) {
      e.preventDefault();
      e.stopPropagation();
      bridge.executeOperation({ type: 'outdent', nodeId });
      return;
    }
    if (e.key === 'Enter' && nodeId) {
      e.preventDefault();
      const parent = findParent(tree.root, nodeId);
      if (parent) {
        const idx = findIndex(parent, nodeId);
        bridge.executeOperation({ type: 'create', parentId: parent.id, index: idx + 1, title: '' });
      }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && nodeId) {
      e.preventDefault();
      bridge.executeOperation({ type: 'delete', nodeId });
      selectedNodeId.value = null;
      return;
    }
    if (e.key === 'F2' && nodeId) {
      e.preventDefault();
      editingNodeId.value = nodeId;
      return;
    }
    if (e.key === '.' && meta && e.shiftKey && nodeId) {
      e.preventDefault();
      const newCollapsed = new Set(collapsedIds.value);
      if (newCollapsed.has(nodeId)) {
        newCollapsed.delete(nodeId);
      } else {
        newCollapsed.add(nodeId);
      }
      collapsedIds.value = newCollapsed;
      return;
    }
  }, [tree, visibleNodes, selectedNodeId, editingNodeId, collapsedIds, bridge]);

  const handleDrop = useCallback((draggedId: string, targetId: string, position: 'before' | 'after' | 'child') => {
    if (!tree) return;
    if (isDescendant(tree.root, draggedId, targetId)) return;
    if (draggedId === targetId) return;

    const target = findNode(tree.root, targetId);
    const targetParent = findParent(tree.root, targetId);
    if (!target || !targetParent) return;

    switch (position) {
      case 'before': {
        const idx = findIndex(targetParent, targetId);
        bridge.executeOperation({ type: 'move', nodeId: draggedId, newParentId: targetParent.id, index: idx });
        break;
      }
      case 'after': {
        const idx = findIndex(targetParent, targetId) + 1;
        bridge.executeOperation({ type: 'move', nodeId: draggedId, newParentId: targetParent.id, index: idx });
        break;
      }
      case 'child': {
        bridge.executeOperation({ type: 'move', nodeId: draggedId, newParentId: targetId, index: -1 });
        break;
      }
    }
  }, [tree, bridge]);

  function renderNode(node: MindDocNode, depth: number): h.JSX.Element | null {
    if (filterIds && !filterIds.has(node.id)) return null;

    const isCollapsed = collapsedIds.value.has(node.id);

    return (
      <Fragment>
        <OutlineNode
          key={node.id}
          node={node}
          depth={depth}
          isSelected={selectedNodeId.value === node.id}
          isEditing={editingNodeId.value === node.id}
          isCollapsed={isCollapsed}
          indentSize={24}
          showNotePreview={bridge.settings.value.showNotePreview}
          dropPosition={dragState?.targetId === node.id ? dragState.position : null}
          highlightQuery={searchQuery}
          onSelect={() => { selectedNodeId.value = node.id; }}
          onToggleCollapse={() => {
            const newSet = new Set(collapsedIds.value);
            if (newSet.has(node.id)) newSet.delete(node.id);
            else newSet.add(node.id);
            collapsedIds.value = newSet;
          }}
          onStartEdit={() => { editingNodeId.value = node.id; }}
          onEndEdit={(newTitle) => {
            if (newTitle !== node.title) {
              bridge.executeOperation({ type: 'rename', nodeId: node.id, newTitle });
            }
            editingNodeId.value = null;
          }}
          onCancelEdit={() => { editingNodeId.value = null; }}
          onDragStart={(e) => {
            e.dataTransfer!.setData('text/plain', node.id);
            e.dataTransfer!.effectAllowed = 'move';
            setDragState({ draggedId: node.id, targetId: null, position: null });
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer!.dropEffect = 'move';
            if (!dragState) return;
            const pos = getDropPosition(e, e.currentTarget as HTMLElement);
            if (dragState.targetId !== node.id || dragState.position !== pos) {
              setDragState({ ...dragState, targetId: node.id, position: pos });
            }
          }}
          onDragLeave={() => {
            if (dragState?.targetId === node.id) {
              setDragState({ ...dragState, targetId: null, position: null });
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragState && dragState.targetId && dragState.position) {
              handleDrop(dragState.draggedId, dragState.targetId, dragState.position);
            }
            setDragState(null);
          }}
          onKeyDown={handleKeyDown}
        />
        {!isCollapsed && node.children.map(child => renderNode(child, depth + 1))}
      </Fragment>
    );
  }

  return (
    <div
      class="minddoc-outline"
      onKeyDown={handleKeyDown}
      onDragEnd={() => setDragState(null)}
      tabIndex={-1}
    >
      {showSearch && (
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onClose={() => { setShowSearch(false); setSearchQuery(''); }}
          matchCount={matchCount}
        />
      )}
      {tree.root.children.map(child => renderNode(child, 0))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/vscode/src/webview/OutlineView.tsx
git commit -m "feat(vscode): add OutlineView with keyboard shortcuts and drag-and-drop"
```

---

## Task 3: Rewrite App.tsx with full layout

**Files:**
- Modify: `packages/vscode/src/webview/App.tsx`

Replace the placeholder with the full MindDoc layout: toolbar + conditional view + detail panel. For Phase 2, only outline view is functional; mind map shows a placeholder.

- [ ] **Step 1: Rewrite App.tsx**

```tsx
import { h } from 'preact';
import { signal } from '@preact/signals';
import { findNode } from '@minddoc/core';
import { WebviewBridge } from './WebviewBridge.js';
import { OutlineToolbar } from './components/OutlineToolbar.js';
import { OutlineView } from './OutlineView.js';
import { DetailPanel } from './components/DetailPanel.js';

const bridge = new WebviewBridge();

const collapsedIds = signal<Set<string>>(new Set());
const selectedNodeId = signal<string | null>(null);
const editingNodeId = signal<string | null>(null);

function getAllNodeIds(node: { id: string; children: { id: string; children: any[] }[] }): string[] {
  const ids: string[] = [];
  function walk(n: typeof node) {
    if (n.id) ids.push(n.id);
    n.children.forEach(walk);
  }
  walk(node);
  return ids;
}

bridge.onCommand((cmd) => {
  const tree = bridge.tree.value;
  switch (cmd.name) {
    case 'expandAll':
      collapsedIds.value = new Set();
      break;
    case 'collapseAll':
      if (tree) {
        collapsedIds.value = new Set(getAllNodeIds(tree.root));
      }
      break;
    case 'toggleView': {
      const next = bridge.activeView.value === 'outline' ? 'mindmap' : 'outline';
      bridge.activeView.value = next;
      bridge.syncState({ activeView: next });
      break;
    }
  }
});

export function App() {
  const tree = bridge.tree.value;
  const view = bridge.activeView.value;

  if (!tree) {
    return <div class="minddoc-loading">Loading...</div>;
  }

  const selectedNode = selectedNodeId.value ? findNode(tree.root, selectedNodeId.value) : null;

  return (
    <div class="minddoc-container">
      <OutlineToolbar
        currentView={view}
        onSwitchView={(v) => {
          bridge.activeView.value = v;
          bridge.syncState({ activeView: v });
        }}
        onExpandAll={() => { collapsedIds.value = new Set(); }}
        onCollapseAll={() => {
          collapsedIds.value = new Set(getAllNodeIds(tree.root));
        }}
      />
      <div class="minddoc-main-area">
        {view === 'outline' ? (
          <OutlineView
            bridge={bridge}
            collapsedIds={collapsedIds}
            selectedNodeId={selectedNodeId}
            editingNodeId={editingNodeId}
          />
        ) : (
          <div class="minddoc-loading">Mind Map view coming in Phase 3.</div>
        )}
      </div>
      {view === 'outline' && selectedNode && (
        <DetailPanel
          node={selectedNode}
          onUpdateNote={(nodeId, newNote) => {
            bridge.executeOperation({ type: 'updateNote', nodeId, note: newNote });
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/vscode/src/webview/App.tsx
git commit -m "feat(vscode): replace placeholder App with full outline layout"
```

---

## Task 4: Create outline CSS (adapted for VSCode)

**Files:**
- Create: `packages/vscode/src/webview/styles/outline.css`

Adapts the Obsidian CSS to use VSCode CSS variables. Key mappings:
- `--background-modifier-border` → `--vscode-panel-border`
- `--background-modifier-hover` → `--vscode-list-hoverBackground`
- `--background-modifier-active-hover` → `--vscode-list-activeSelectionBackground`
- `--interactive-normal` → `--vscode-button-secondaryBackground`
- `--interactive-hover` → `--vscode-button-secondaryHoverBackground`
- `--interactive-accent` → `--vscode-focusBorder`
- `--text-normal` → `--vscode-foreground`
- `--text-muted` → `--vscode-descriptionForeground`
- `--text-faint` → `--vscode-disabledForeground`
- `--background-primary` → `--vscode-editor-background`
- `--background-secondary` → `--vscode-sideBar-background`
- `--font-text` → `--vscode-font-family`

- [ ] **Step 1: Create outline.css**

```css
.minddoc-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--vscode-editor-background);
  color: var(--vscode-foreground);
  font-family: var(--vscode-font-family);
}

.minddoc-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.minddoc-toolbar-btn {
  padding: 4px 8px;
  border-radius: 4px;
  border: none;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  cursor: pointer;
  font-size: 12px;
}

.minddoc-toolbar-btn:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.minddoc-main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.minddoc-outline {
  font-family: var(--vscode-font-family);
  font-size: 14px;
  padding: 8px;
  flex: 1;
  overflow-y: auto;
  outline: none;
}

.minddoc-node {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 4px;
  border-radius: 4px;
  cursor: default;
  user-select: none;
  position: relative;
}

.minddoc-node:hover {
  background: var(--vscode-list-hoverBackground);
}

.minddoc-node.is-selected {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.minddoc-collapse-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--vscode-disabledForeground);
  flex-shrink: 0;
  border: none;
  background: none;
  padding: 0;
}

.minddoc-collapse-btn:hover {
  color: var(--vscode-foreground);
}

.minddoc-drag-handle {
  width: 16px;
  height: 16px;
  opacity: 0;
  cursor: grab;
  color: var(--vscode-disabledForeground);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}

.minddoc-node:hover .minddoc-drag-handle {
  opacity: 1;
}

.minddoc-bullet {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vscode-disabledForeground);
  margin: 0 4px;
  flex-shrink: 0;
}

.minddoc-checkbox {
  margin: 0 4px;
  flex-shrink: 0;
}

.minddoc-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.minddoc-note-preview {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  margin-left: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.minddoc-inline-editor {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-focusBorder);
  border-radius: 2px;
  padding: 0 4px;
  font-size: inherit;
  font-family: inherit;
  color: var(--vscode-input-foreground);
  width: 100%;
  outline: none;
}

.minddoc-drop-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--vscode-focusBorder);
  pointer-events: none;
}

.minddoc-drop-line.before {
  top: 0;
}

.minddoc-drop-line.after {
  bottom: 0;
}

.minddoc-node.drop-highlight {
  background: var(--vscode-list-activeSelectionBackground) !important;
}

/* View Switcher */
.minddoc-view-switcher {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--vscode-panel-border);
  border-radius: 6px;
}

.minddoc-switch-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  font-size: 12px;
}

.minddoc-switch-btn.is-active {
  background: var(--vscode-editor-background);
  color: var(--vscode-foreground);
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

/* Search Bar */
.minddoc-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--vscode-panel-border);
  background: var(--vscode-sideBar-background);
}

.minddoc-search-input {
  flex: 1;
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 13px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  outline: none;
}

.minddoc-search-input:focus {
  border-color: var(--vscode-focusBorder);
}

.minddoc-search-count {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
}

.minddoc-search-close {
  border: none;
  background: none;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  font-size: 16px;
  padding: 2px 4px;
}

.minddoc-highlight {
  background: var(--vscode-editor-findMatchHighlightBackground, rgba(255, 208, 0, 0.4));
  border-radius: 2px;
}

/* Detail Panel */
.minddoc-detail-panel {
  border-top: 1px solid var(--vscode-panel-border);
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.minddoc-detail-note textarea {
  width: 100%;
  min-height: 60px;
  border: 1px solid var(--vscode-input-border);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 4px;
  padding: 8px;
  font-family: var(--vscode-font-family);
  font-size: 13px;
  resize: vertical;
}

.minddoc-detail-note textarea:focus {
  border-color: var(--vscode-focusBorder);
  outline: none;
}

.minddoc-detail-blocks pre {
  background: var(--vscode-textBlockQuote-background);
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  margin: 4px 0;
}

.minddoc-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--vscode-descriptionForeground);
}
```

- [ ] **Step 2: Import the CSS in index.tsx**

Update `packages/vscode/src/webview/index.tsx` to import the stylesheet:

```tsx
import { h, render } from 'preact';
import { App } from './App.js';
import './styles/outline.css';

const root = document.getElementById('root');
if (root) {
  render(<App />, root);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/vscode/src/webview/styles/ packages/vscode/src/webview/index.tsx
git commit -m "feat(vscode): add outline CSS with VSCode theme variable mapping"
```

---

## Task 5: Update esbuild config to handle CSS

**Files:**
- Modify: `packages/vscode/esbuild.config.mjs`

esbuild already bundles CSS imported in JS by default — it will output a `.css` file alongside the JS. We need to make the webview build output both `dist/webview.js` and `dist/webview.css`.

- [ ] **Step 1: Verify esbuild CSS handling**

No config change needed — esbuild automatically processes CSS imports and outputs `dist/webview.css` alongside `dist/webview.js`. The HTML template in `MindDocEditorProvider.ts` already loads `${cssUri}` which points to a CSS file in dist. Verify by running:

```bash
cd packages/vscode && pnpm run build
ls dist/webview.*
```

Expected output: `dist/webview.js` and `dist/webview.css`

- [ ] **Step 2: Verify HTML template loads CSS**

Check that `MindDocEditorProvider.ts` generates a `<link>` tag for the CSS. The existing implementation should already have this from Phase 1 (it loads `webview.css` from dist). If not, update the `getWebviewHtml` method to include:

```html
<link rel="stylesheet" href="${cssUri}">
```

where `cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.css'))`

- [ ] **Step 3: Commit (if changes needed)**

```bash
git add packages/vscode/
git commit -m "fix(vscode): ensure CSS is loaded in webview HTML template"
```

---

## Task 6: Build verification and smoke test

**Files:**
- Verify: Full build works
- Verify: Webview renders outline correctly

- [ ] **Step 1: Install dependencies and build**

```bash
pnpm install
pnpm --filter @minddoc/core build
pnpm --filter vscode-minddoc build
```

Expected: Both `dist/webview.js` and `dist/webview.css` generated without errors.

- [ ] **Step 2: Run core tests to verify no regressions**

```bash
pnpm test
```

Expected: All 125 tests pass.

- [ ] **Step 3: Verify bundle sizes are reasonable**

```bash
ls -la packages/vscode/dist/
```

Expected:
- `extension.js` ~300KB (includes @minddoc/core bundled in)
- `webview.js` ~25-35KB (Preact + components + core tree utilities)
- `webview.css` ~3-5KB (all outline styles)

- [ ] **Step 4: Manual smoke test (if possible)**

```bash
cd packages/vscode
code --extensionDevelopmentPath=$(pwd) --new-window
```

Open or create a `.mind.md` file. Expected:
- Toolbar shows with Expand All / Collapse All buttons and view switcher
- Outline renders all nodes from the document
- Clicking a node selects it (blue highlight)
- Double-clicking enters edit mode
- Arrow keys navigate between nodes
- Tab indents, Shift+Tab outdents
- Enter creates new sibling
- Delete removes node
- Ctrl+F opens search
- Drag and drop reorders nodes
- Detail panel shows at bottom when node is selected

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat(vscode): complete Phase 2 - outline view with full editing"
```

---

## Summary

Phase 2 creates a fully functional outline editing experience in the VSCode extension:

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | 7 pure Preact component files | 3 min |
| 2 | OutlineView with bridge adaptation | 5 min |
| 3 | App.tsx full layout with command handling | 3 min |
| 4 | CSS with VSCode variable mapping | 3 min |
| 5 | Verify esbuild CSS output | 2 min |
| 6 | Build verification and smoke test | 5 min |

**Total: ~6 tasks, ~20 minutes of agent time**

After Phase 2, the extension provides:
- Full outline tree rendering with collapse/expand
- Keyboard navigation and shortcuts (Tab, Enter, Delete, F2, arrows, Ctrl+arrows)
- Drag-and-drop reordering
- Inline title editing
- Search/filter with ancestor preservation
- Detail panel for notes and code blocks
- View switcher (mind map stub for Phase 3)
- VSCode-native undo/redo integration
- Multi-webview sync (from Phase 1 infrastructure)
