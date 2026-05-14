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
    <div class="mindctx-toolbar">
      <button
        class="mindctx-toolbar-btn"
        onClick={onExpandAll}
        title="展开全部"
      >
        展开全部
      </button>
      <button
        class="mindctx-toolbar-btn"
        onClick={onCollapseAll}
        title="折叠全部"
      >
        折叠全部
      </button>
      <div style={{ flex: 1 }} />
      {currentView && onSwitchView && (
        <ViewSwitcher currentView={currentView} onSwitch={onSwitchView} />
      )}
    </div>
  );
}
