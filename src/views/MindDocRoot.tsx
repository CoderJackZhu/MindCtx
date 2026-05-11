import { h } from 'preact';
import type { Signal } from '@preact/signals';
import type { MindDocTree, PartialOperation } from '../core/types.js';
import { OutlineToolbar } from './components/OutlineToolbar.js';
import { OutlineView } from './OutlineView.js';

interface MindDocRootProps {
  treeSignal: Signal<MindDocTree | null>;
  collapsedIds: Signal<Set<string>>;
  selectedNodeId: Signal<string | null>;
  editingNodeId: Signal<string | null>;
  onOperation: (op: PartialOperation) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function MindDocRoot(props: MindDocRootProps) {
  return (
    <div class="minddoc-container">
      <OutlineToolbar
        onExpandAll={props.onExpandAll}
        onCollapseAll={props.onCollapseAll}
      />
      <OutlineView
        treeSignal={props.treeSignal}
        collapsedIds={props.collapsedIds}
        selectedNodeId={props.selectedNodeId}
        editingNodeId={props.editingNodeId}
        onOperation={props.onOperation}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
      />
    </div>
  );
}
