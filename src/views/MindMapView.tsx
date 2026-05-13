import { h, type JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance, NodeObj, Topic } from 'mind-elixir';
import {
  getMindElixirDirection,
  treeToMindElixirData,
  setupMindElixirEvents,
  syncMindElixirAddChildButtons,
} from '../bridge/mindElixirBridge.js';
import type { SelectionCallbacks } from '../bridge/mindElixirBridge.js';
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
      class="minddoc-mindmap-zoom-controls"
      onMouseLeave={() => setIsOpen(false)}
    >
      {isOpen && (
        <div class="minddoc-mindmap-zoom-panel">
          <button
            type="button"
            class="minddoc-mindmap-center-button"
            onClick={onCenter}
            title="定位到中心主题"
            aria-label="定位到中心主题"
          >
            <svg
              class="minddoc-mindmap-center-icon"
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
            class="minddoc-mindmap-zoom-slider"
            min="10"
            max="400"
            value={String(percentage)}
            onInput={handleSliderInput}
            onChange={handleSliderInput}
            aria-label="缩放比例"
          />
        </div>
      )}
      <button
        type="button"
        class="minddoc-mindmap-zoom-value"
        onMouseEnter={() => setIsOpen(true)}
        aria-expanded={isOpen}
      >
        {percentage}%
      </button>
    </div>
  );
}

interface FloatingToolbarProps {
  selectedNodeId: string | null;
  onToggleCheck: () => void;
  onStartConnection: () => void;
  onInsertLink: (text: string, url: string) => void;
  connectionMode: boolean;
}

function LinkPanel({ onConfirm, onClose }: { onConfirm: (text: string, url: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');

  const handleConfirm = () => {
    if (url.trim()) {
      onConfirm(text.trim() || url.trim(), url.trim());
      onClose();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div class="minddoc-floating-toolbar-link-panel" onKeyDown={handleKeyDown}>
      <input
        type="text"
        class="minddoc-floating-toolbar-link-input"
        placeholder="显示文字"
        value={text}
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
      />
      <input
        type="text"
        class="minddoc-floating-toolbar-link-input"
        placeholder="链接地址"
        value={url}
        onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
        autoFocus
      />
      <button
        type="button"
        class="minddoc-floating-toolbar-link-confirm"
        onClick={handleConfirm}
        disabled={!url.trim()}
      >
        确认
      </button>
    </div>
  );
}

function FloatingToolbar({ selectedNodeId, onToggleCheck, onStartConnection, onInsertLink, connectionMode }: FloatingToolbarProps) {
  const [showLinkPanel, setShowLinkPanel] = useState(false);

  useEffect(() => {
    setShowLinkPanel(false);
  }, [selectedNodeId]);

  if (!selectedNodeId) return null;

  return (
    <div class="minddoc-floating-toolbar">
      <button
        type="button"
        class="minddoc-floating-toolbar-btn"
        onClick={onToggleCheck}
        title="切换待办状态"
      >
        ☑ 待办
      </button>
      <button
        type="button"
        class={`minddoc-floating-toolbar-btn${connectionMode ? ' is-active' : ''}`}
        onClick={onStartConnection}
        title="创建连结线"
      >
        🔗 连结线
      </button>
      <button
        type="button"
        class={`minddoc-floating-toolbar-btn${showLinkPanel ? ' is-active' : ''}`}
        onClick={() => setShowLinkPanel(!showLinkPanel)}
        title="插入链接"
      >
        🌐 链接
      </button>
      {showLinkPanel && (
        <LinkPanel
          onConfirm={onInsertLink}
          onClose={() => setShowLinkPanel(false)}
        />
      )}
    </div>
  );
}

export function MindMapView({ tree, collapsedIds, onOperation, onUndo, onRedo, onCollapsedChange, direction }: MindMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<MindElixirInstance | null>(null);
  const scaleRef = useRef(1.0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const isInternalUpdate = useRef(false);
  const collapsedIdsRef = useRef(collapsedIds);
  const treeIdRef = useRef<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [currentScale, setCurrentScale] = useState(1.0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState(false);
  const connectionSourceRef = useRef<string | null>(null);
  const connectionSvgRef = useRef<SVGElement | null>(null);

  collapsedIdsRef.current = collapsedIds;

  const wrappedOnOperation = (op: PartialOperation) => {
    isInternalUpdate.current = true;
    onOperation(op);
    queueMicrotask(() => { isInternalUpdate.current = false; });
  };

  const handleToggleCheck = () => {
    if (selectedNodeId) {
      onOperation({ type: 'toggleCheck', nodeId: selectedNodeId });
    }
  };

  const cleanupConnectionMode = () => {
    setConnectionMode(false);
    connectionSourceRef.current = null;
    if (connectionSvgRef.current) {
      connectionSvgRef.current.remove();
      connectionSvgRef.current = null;
    }
  };

  const handleStartConnection = () => {
    if (connectionMode) {
      cleanupConnectionMode();
      return;
    }
    if (!selectedNodeId) return;
    setConnectionMode(true);
    connectionSourceRef.current = selectedNodeId;

    const container = containerRef.current;
    if (!container) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('minddoc-connection-preview');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '15';
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('stroke', 'var(--interactive-accent)');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '6 4');
    svg.appendChild(line);
    container.parentElement!.appendChild(svg);
    connectionSvgRef.current = svg;

    const sourceEl = container.querySelector<HTMLElement>(`me-tpc[data-nodeid="${selectedNodeId}"]`) ??
      container.querySelector<HTMLElement>(`[data-nodeid="${selectedNodeId}"]`);

    const onMouseMove = (e: MouseEvent) => {
      if (!sourceEl || !svg.parentElement) return;
      const shellRect = svg.parentElement.getBoundingClientRect();
      const srcRect = sourceEl.getBoundingClientRect();
      const x1 = srcRect.left + srcRect.width / 2 - shellRect.left;
      const y1 = srcRect.top + srcRect.height / 2 - shellRect.top;
      const x2 = e.clientX - shellRect.left;
      const y2 = e.clientY - shellRect.top;
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
    };

    const onTargetClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('me-tpc');
      if (!target) return;
      const targetNodeObj = (target as unknown as { nodeObj?: NodeObj }).nodeObj;
      if (targetNodeObj && targetNodeObj.id !== connectionSourceRef.current) {
        const me = instanceRef.current;
        if (me && connectionSourceRef.current) {
          const fromEl = container.querySelector<HTMLElement>(`me-tpc[data-nodeid="${connectionSourceRef.current}"]`) ??
            container.querySelector<HTMLElement>(`[data-nodeid="${connectionSourceRef.current}"]`);
          if (fromEl) {
            me.createArrow(fromEl as unknown as import('mind-elixir').Topic, target as unknown as import('mind-elixir').Topic);
          }
        }
      }
      cleanup();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
      }
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('click', onTargetClick, true);
      document.removeEventListener('keydown', onKeyDown);
      cleanupConnectionMode();
    };

    document.addEventListener('mousemove', onMouseMove);
    container.addEventListener('click', onTargetClick, true);
    document.addEventListener('keydown', onKeyDown);
  };

  const handleInsertLink = (text: string, url: string) => {
    if (!selectedNodeId || !tree) return;
    const node = findNode(tree.root, selectedNodeId);
    if (!node) return;
    const linkMd = `[${text}](${url})`;
    const newTitle = node.title ? `${node.title} ${linkMd}` : linkMd;
    onOperation({ type: 'rename', nodeId: selectedNodeId, newTitle });
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
    scaleRef.current = 1.0;
    setCurrentScale(1.0);
    syncMindElixirAddChildButtons(me);

    const addButtonObserver = new MutationObserver(() => {
      syncMindElixirAddChildButtons(me);
    });
    addButtonObserver.observe(containerRef.current, { childList: true, subtree: true });

    cleanupRef.current = setupMindElixirEvents(me, wrappedOnOperation, onCollapsedChange, () => collapsedIdsRef.current, {
      onSelect: (nodeId: string, isRoot: boolean) => {
        if (isRoot) {
          setSelectedNodeId(null);
        } else {
          setSelectedNodeId(nodeId);
        }
      },
      onUnselect: () => {
        setSelectedNodeId(null);
      },
    });
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
    syncMindElixirAddChildButtons(instanceRef.current);
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
        void me.addChild(selectedNode as Topic);
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
      <ZoomControls
        scale={currentScale}
        onScaleChange={applyScale}
        onCenter={handleCenter}
      />
      <div
        ref={containerRef}
        class="minddoc-mindmap-container"
        style={{ width: '100%', height: '100%' }}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
      />
      <FloatingToolbar
        selectedNodeId={selectedNodeId}
        onToggleCheck={handleToggleCheck}
        onStartConnection={handleStartConnection}
        onInsertLink={handleInsertLink}
        connectionMode={connectionMode}
      />
    </div>
  );
}
