import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance } from 'mind-elixir';
import { treeToMindElixirData, setupMindElixirEvents } from '../bridge/mindElixirBridge.js';
import { getObsidianTheme, applyTheme } from '../bridge/mindElixirTheme.js';
import type { MindDocTree, PartialOperation } from '../core/types.js';

interface MindMapViewProps {
  tree: MindDocTree | null;
  collapsedIds: Set<string>;
  onOperation: (op: PartialOperation) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCollapsedChange: (ids: Set<string>) => void;
}

export function MindMapView({ tree, collapsedIds, onOperation, onUndo, onRedo, onCollapsedChange }: MindMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<MindElixirInstance | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const isInternalUpdate = useRef(false);
  const collapsedIdsRef = useRef(collapsedIds);
  const treeIdRef = useRef<string | null>(null);

  collapsedIdsRef.current = collapsedIds;

  const wrappedOnOperation = (op: PartialOperation) => {
    isInternalUpdate.current = true;
    onOperation(op);
    queueMicrotask(() => { isInternalUpdate.current = false; });
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
      contextMenu: false,
      toolBar: false,
      keypress: false,
      locale: 'zh_CN' as any,
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

    cleanupRef.current = setupMindElixirEvents(me, wrappedOnOperation, onCollapsedChange, () => collapsedIdsRef.current);
    instanceRef.current = me;

    return () => {
      cleanupRef.current?.();
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
      const nodeObj = (selectedNode as any).nodeObj;
      if (nodeObj) {
        onOperation({
          type: 'create',
          parentId: nodeObj.id,
          index: -1,
          title: '新节点',
        });
      }
    } else if (e.key === 'Enter' && selectedNode) {
      e.preventDefault();
      const nodeObj = (selectedNode as any).nodeObj;
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
      const nodeObj = (selectedNode as any).nodeObj;
      if (nodeObj?.parent) {
        onOperation({ type: 'delete', nodeId: nodeObj.id });
      }
    } else if (e.key === 'F2' && selectedNode) {
      e.preventDefault();
      me.beginEdit(selectedNode);
    }
  };

  return (
    <div
      ref={containerRef}
      class="minddoc-mindmap-container"
      style={{ width: '100%', height: '100%' }}
      tabIndex={0}
      onKeyDown={handleKeyDown as any}
    />
  );
}
