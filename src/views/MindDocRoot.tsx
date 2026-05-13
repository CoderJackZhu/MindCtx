import { h } from 'preact';
import type { Signal } from '@preact/signals';
import type { MindDocTree, PartialOperation } from '../core/types.js';
import { findNode } from '../core/operations.js';
import { OutlineToolbar } from './components/OutlineToolbar.js';
import { OutlineView } from './OutlineView.js';
import { MindMapView } from './MindMapView.js';
import { DetailPanel } from './components/DetailPanel.js';
import type { MindMapDirection } from '../bridge/mindElixirBridge.js';

interface MindDocRootProps {
  treeSignal: Signal<MindDocTree | null>;
  collapsedIds: Signal<Set<string>>;
  selectedNodeId: Signal<string | null>;
  editingNodeId: Signal<string | null>;
  currentView: Signal<'outline' | 'mindmap'>;
  onOperation: (op: PartialOperation) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSwitchView: (view: 'outline' | 'mindmap') => void;
  onCollapsedChange: (ids: Set<string>) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  mindmapDirection: MindMapDirection;
}

export function MindDocRoot(props: MindDocRootProps) {
  const tree = props.treeSignal.value;
  const view = props.currentView.value;
  const selectedId = props.selectedNodeId.value;

  const selectedNode = tree && selectedId ? findNode(tree.root, selectedId) : null;

  return (
    <div class="minddoc-container">
      <OutlineToolbar
        currentView={view}
        onSwitchView={props.onSwitchView}
        onExpandAll={props.onExpandAll}
        onCollapseAll={props.onCollapseAll}
      />
      <div class="minddoc-main-area">
        {view === 'outline' ? (
          <OutlineView
            treeSignal={props.treeSignal}
            collapsedIds={props.collapsedIds}
            selectedNodeId={props.selectedNodeId}
            editingNodeId={props.editingNodeId}
            onOperation={props.onOperation}
            onUndo={props.onUndo}
            onRedo={props.onRedo}
          />
        ) : tree ? (
          <MindMapView
            tree={tree}
            collapsedIds={props.collapsedIds.value}
            onOperation={props.onOperation}
            onUndo={props.onUndo}
            onRedo={props.onRedo}
            onCollapsedChange={props.onCollapsedChange}
            direction={props.mindmapDirection}
          />
        ) : (
          <div class="minddoc-loading">加载中...</div>
        )}
      </div>
      {view === 'outline' && selectedNode && (
        <DetailPanel
          node={selectedNode}
          onUpdateNote={(nodeId, newNote) => {
            props.onOperation({ type: 'updateNote', nodeId, note: newNote });
          }}
        />
      )}
    </div>
  );
}
