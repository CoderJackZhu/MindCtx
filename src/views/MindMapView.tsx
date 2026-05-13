import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance } from 'mind-elixir';
import {
  getMindElixirDirection,
  treeToMindElixirData,
  setupMindElixirEvents,
  syncMindElixirAddChildButtons,
} from '../bridge/mindElixirBridge.js';
import { getObsidianTheme, applyTheme } from '../bridge/mindElixirTheme.js';
import type { MindDocTree, PartialOperation } from '../core/types.js';
import { findNode } from '../core/operations.js';
import type { MindMapDirection } from '../bridge/mindElixirBridge.js';

interface MindMapViewProps {
  tree: MindDocTree | null;
  collapsedIds: Set<string>;
  onOperation: (op: PartialOperation) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCollapsedChange: (ids: Set<string>) => void;
  direction: MindMapDirection;
}

interface NodeObj {
  id: string;
  parent?: NodeObj;
}

export function MindMapView({ tree, collapsedIds, onOperation, onUndo, onRedo, onCollapsedChange, direction }: MindMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<MindElixirInstance | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const isInternalUpdate = useRef(false);
  const collapsedIdsRef = useRef(collapsedIds);
  const treeRef = useRef(tree);
  const treeIdRef = useRef<string | null>(null);
  const pendingEditParentIdRef = useRef<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  collapsedIdsRef.current = collapsedIds;
  treeRef.current = tree;

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
    const currentTree = treeRef.current;
    if (!currentTree) return;
    const parent = findNode(currentTree.root, parentId);
    if (!parent) return;

    pendingEditParentIdRef.current = parentId;
    onOperation({
      type: 'create',
      parentId,
      index: -1,
      title: '',
    });
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
            name: '进入此节点',
            onclick: (event: MouseEvent) => {
              closeContextMenu(event);
              enterFocusedNode();
            },
          },
        ],
      },
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

    const data = treeToMindElixirData(tree, collapsedIds, direction, focusNodeId);
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
    const data = treeToMindElixirData(tree, collapsedIds, direction, focusNodeId);
    instanceRef.current.refresh(data);
    syncMindElixirAddChildButtons(instanceRef.current, createChildAndEdit);
    if (pendingEditParentIdRef.current) {
      const parentId = pendingEditParentIdRef.current;
      const parent = findNode(tree.root, parentId);
      const newNode = parent?.children[parent.children.length - 1];
      pendingEditParentIdRef.current = null;
      if (newNode) focusNodeForEditing(newNode.id);
    }
  }, [tree, collapsedIds, direction, focusNodeId]);

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

  const focusedNode = tree && focusNodeId ? findNode(tree.root, focusNodeId) : null;

  return (
    <div class="minddoc-mindmap-shell">
      {focusedNode && (
        <div class="minddoc-mindmap-focusbar">
          <span class="minddoc-mindmap-focusbar-label">当前聚焦：{focusedNode.title || '(空节点)'}</span>
          <button
            type="button"
            class="minddoc-mindmap-focusbar-button"
            onClick={() => setFocusNodeId(null)}
          >
            退出聚焦
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        class="minddoc-mindmap-container"
        style={{ width: '100%', height: '100%' }}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
