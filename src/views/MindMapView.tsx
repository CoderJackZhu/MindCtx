import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance } from 'mind-elixir';
import { treeToMindElixirData, setupMindElixirEvents, syncMindElixirAddChildButtons } from '../bridge/mindElixirBridge.js';
import { getObsidianTheme, applyTheme } from '../bridge/mindElixirTheme.js';
import type { MindDocTree, PartialOperation } from '../core/types.js';
import { findNode } from '../core/operations.js';

interface MindMapViewProps {
  tree: MindDocTree | null;
  collapsedIds: Set<string>;
  onOperation: (op: PartialOperation) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCollapsedChange: (ids: Set<string>) => void;
}

interface NodeObj {
  id: string;
  parent?: NodeObj;
}

export function MindMapView({ tree, collapsedIds, onOperation, onUndo, onRedo, onCollapsedChange }: MindMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<MindElixirInstance | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const isInternalUpdate = useRef(false);
  const collapsedIdsRef = useRef(collapsedIds);
  const treeIdRef = useRef<string | null>(null);
  const pendingEditParentIdRef = useRef<string | null>(null);

  collapsedIdsRef.current = collapsedIds;

  const wrappedOnOperation = (op: PartialOperation) => {
    isInternalUpdate.current = true;
    onOperation(op);
    queueMicrotask(() => { isInternalUpdate.current = false; });
  };

  const focusNodeForEditing = (nodeId: string) => {
    requestAnimationFrame(() => {
      const me = instanceRef.current;
      if (!me) return;
      const topic = me.findEle(nodeId);
      if (!topic) return;
      me.selectNode(topic);
      void me.beginEdit(topic);
    });
  };

  const createChildAndEdit = (parentId: string) => {
    if (!tree) return;
    const parent = findNode(tree.root, parentId);
    if (!parent) return;

    pendingEditParentIdRef.current = parentId;
    onOperation({
      type: 'create',
      parentId,
      index: -1,
      title: '',
    });
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
      direction: MindElixir.SIDE,
      draggable: true,
      selectionContainer: containerRef.current.ownerDocument.body,
      contextMenu: false,
      toolBar: false,
      keypress: false,
      locale: 'zh_CN' as const,
    });

    applyTheme(containerRef.current, getObsidianTheme(containerRef.current));

    const themeObserver = new MutationObserver(() => {
      if (containerRef.current) {
        applyTheme(containerRef.current, getObsidianTheme(containerRef.current));
      }
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    const data = treeToMindElixirData(tree, collapsedIds);
    me.init(data);
    syncMindElixirAddChildButtons(me, createChildAndEdit);

    const addButtonObserver = new MutationObserver(() => {
      syncMindElixirAddChildButtons(me, createChildAndEdit);
    });
    addButtonObserver.observe(containerRef.current, { childList: true, subtree: true });

    cleanupRef.current = setupMindElixirEvents(me, wrappedOnOperation, onCollapsedChange, () => collapsedIdsRef.current);
    instanceRef.current = me;

    return () => {
      cleanupRef.current?.();
      addButtonObserver.disconnect();
      themeObserver.disconnect();
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
      treeIdRef.current = null;
    };
  }, [tree?.filePath]);

  useEffect(() => {
    if (!instanceRef.current || !tree) return;
    if (isInternalUpdate.current) return;
    const data = treeToMindElixirData(tree, collapsedIds);
    instanceRef.current.refresh(data);
    syncMindElixirAddChildButtons(instanceRef.current, createChildAndEdit);
    if (pendingEditParentIdRef.current) {
      const parentId = pendingEditParentIdRef.current;
      const parent = findNode(tree.root, parentId);
      const newNode = parent?.children[parent.children.length - 1];
      pendingEditParentIdRef.current = null;
      if (newNode) focusNodeForEditing(newNode.id);
    }
  }, [tree, collapsedIds]);

  const handleKeyDown = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const me = instanceRef.current;
    if (!me) return;

    const selectedNode = me.currentNode;

    if (mod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      onUndo();
    } else if (mod && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      onRedo();
    } else if (e.key === 'Tab' && selectedNode) {
      e.preventDefault();
      const nodeObj = (selectedNode as unknown as { nodeObj?: NodeObj }).nodeObj;
      if (nodeObj) {
        createChildAndEdit(nodeObj.id);
      }
    } else if (e.key === 'Enter' && selectedNode) {
      e.preventDefault();
      const nodeObj = (selectedNode as unknown as { nodeObj?: NodeObj }).nodeObj;
      if (nodeObj?.parent) {
        onOperation({
          type: 'create',
          parentId: nodeObj.parent.id,
          index: -1,
          title: '新节点',
        });
      }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode) {
      e.preventDefault();
      const nodeObj = (selectedNode as unknown as { nodeObj?: NodeObj }).nodeObj;
      if (nodeObj?.parent) {
        onOperation({ type: 'delete', nodeId: nodeObj.id });
      }
    } else if (e.key === 'F2' && selectedNode) {
      e.preventDefault();
      void me.beginEdit(selectedNode);
    }
  };

  return (
    <div
      ref={containerRef}
      class="minddoc-mindmap-container"
      style={{ width: '100%', height: '100%' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    />
  );
}
