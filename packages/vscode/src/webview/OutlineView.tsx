import { h, Fragment } from 'preact';
import { useState, useCallback, useMemo } from 'preact/hooks';
import type { Signal } from '@preact/signals';
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
