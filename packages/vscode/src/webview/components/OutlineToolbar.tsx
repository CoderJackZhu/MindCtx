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
