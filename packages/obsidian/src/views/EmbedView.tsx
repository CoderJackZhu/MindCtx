import { h, Fragment } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { TFile } from 'obsidian';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance } from 'mind-elixir';
import { parse } from '@minddoc/core';
import { getMindElixirDirection, treeToMindElixirData } from '@minddoc/core/bridge';
import type { MindDocTree, MindDocNode } from '@minddoc/core';
import { getObsidianTheme, applyTheme } from '../bridge/mindElixirTheme.js';
import { MINDDOC_VIEW_TYPE } from '../constants.js';
import type { EmbedConfig } from './EmbedProcessor.js';
import type MindDocPlugin from '../main.js';

interface EmbedViewProps {
  tree: MindDocTree;
  config: EmbedConfig;
  file: TFile;
  plugin: MindDocPlugin;
}

export function EmbedView({ tree, config, file, plugin }: EmbedViewProps) {
  const [currentView, setCurrentView] = useState(config.default);
  const [currentTree, setCurrentTree] = useState(tree);

  const handleOpen = () => {
    const leaf = plugin.app.workspace.getLeaf(true);
    void leaf.setViewState({ type: MINDDOC_VIEW_TYPE, state: { file: file.path } });
  };

  const handleRefresh = () => {
    void plugin.app.vault.read(file).then((content) => {
      const newTree = parse(content, { filePath: file.path });
      setCurrentTree(newTree);
    });
  };

  return (
    <div class="minddoc-embed" style={{ height: `${config.height}px` }}>
      <div class="minddoc-embed-header">
        <span class="minddoc-embed-title">{file.basename}</span>
        <div class="minddoc-embed-actions">
          {config.mode === 'switchable' && (
            <>
              <button
                class={currentView === 'outline' ? 'is-active' : ''}
                onClick={() => setCurrentView('outline')}
              >大纲</button>
              <button
                class={currentView === 'mindmap' ? 'is-active' : ''}
                onClick={() => setCurrentView('mindmap')}
              >脑图</button>
            </>
          )}
          <button onClick={handleOpen} title="打开文件">打开</button>
          <button onClick={handleRefresh} title="刷新">↻</button>
        </div>
      </div>
      <div class="minddoc-embed-content">
        {currentView === 'outline' ? (
          <ReadOnlyOutline tree={currentTree} maxDepth={config.maxDepth} collapsed={config.collapsed} />
        ) : (
          <ReadOnlyMindMap tree={currentTree} direction={plugin.settings.mindmapDirection} />
        )}
      </div>
    </div>
  );
}

interface ReadOnlyOutlineProps {
  tree: MindDocTree;
  maxDepth: number;
  collapsed: boolean;
}

function ReadOnlyOutline({ tree, maxDepth, collapsed }: ReadOnlyOutlineProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    if (!collapsed) return new Set();
    const ids = new Set<string>();
    function walk(node: MindDocNode) {
      if (node.children.length > 0) ids.add(node.id);
      node.children.forEach(walk);
    }
    tree.root.children.forEach(walk);
    return ids;
  });

  function toggleCollapse(nodeId: string) {
    const newSet = new Set(collapsedIds);
    if (newSet.has(nodeId)) newSet.delete(nodeId);
    else newSet.add(nodeId);
    setCollapsedIds(newSet);
  }

  function renderNode(node: MindDocNode, depth: number): h.JSX.Element | null {
    if (depth >= maxDepth) return null;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsedIds.has(node.id);

    return (
      <>
        <div class="minddoc-node" style={{ paddingLeft: `${depth * 24}px` }}>
          <span
            class="minddoc-collapse-btn"
            onClick={() => toggleCollapse(node.id)}
          >
            {hasChildren ? (isCollapsed ? '▸' : '▾') : ' '}
          </span>
          {node.checked !== null ? (
            <input type="checkbox" class="minddoc-checkbox" checked={node.checked} disabled />
          ) : (
            <span class="minddoc-bullet" />
          )}
          <span class="minddoc-title">{node.title}</span>
          {node.note && <span class="minddoc-note-preview">{node.note.slice(0, 50)}</span>}
        </div>
        {!isCollapsed && node.children.map(child => renderNode(child, depth + 1))}
      </>
    );
  }

  return (
    <div class="minddoc-outline minddoc-readonly">
      {tree.root.children.map(child => renderNode(child, 0))}
    </div>
  );
}

interface ReadOnlyMindMapProps {
  tree: MindDocTree;
  direction: MindDocPlugin['settings']['mindmapDirection'];
}

function ReadOnlyMindMap({ tree, direction }: ReadOnlyMindMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<MindElixirInstance | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const me = new MindElixir({
      el: containerRef.current,
      direction: getMindElixirDirection(direction),
      draggable: false,
      editable: false,
      contextMenu: false,
      toolBar: false,
      keypress: false,
    });

    applyTheme(containerRef.current, getObsidianTheme(containerRef.current));

    const data = treeToMindElixirData(tree, new Set(), direction);
    me.init(data);
    instanceRef.current = me;

    return () => {
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
    };
  }, [tree, direction]);

  return (
    <div
      ref={containerRef}
      class="minddoc-mindmap-container"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
