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
      <button
        type="button"
        class="mindctx-mindmap-zoom-value"
        onClick={onCenter}
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

  const applyScaleFn = (nextScale: number) => {
    const normalizedScale = normalizeScale(nextScale);
    scaleRef.current = normalizedScale;
    setCurrentScale(normalizedScale);
    if (instanceRef.current) {
      instanceRef.current.scale(normalizedScale);
      instanceRef.current.toCenter();
    }
  };

  const handleWheel = (event: JSX.TargetedWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP;
    applyScaleFn(scaleRef.current + delta);
  };

  const handleCenter = () => {
    applyScaleFn(1.0);
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
            name: '聚焦此节点',
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

    applyTheme(containerRef.current, getVSCodeTheme(themeColors));

    const data = treeToMindElixirData(tree, collapsedIds.value, direction, focusNodeId);
    me.init(data);
    scaleRef.current = 1.0;
    setCurrentScale(1.0);
    syncMindElixirAddChildButtons(me);

    requestAnimationFrame(() => {
      me.toCenter();
    });

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
        onScaleChange={applyScaleFn}
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
