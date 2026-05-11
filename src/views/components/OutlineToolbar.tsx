import { h } from 'preact';

interface OutlineToolbarProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function OutlineToolbar({ onExpandAll, onCollapseAll }: OutlineToolbarProps) {
  return (
    <div class="minddoc-toolbar">
      <button
        class="minddoc-toolbar-btn"
        onClick={onExpandAll}
        title="展开全部"
      >
        展开全部
      </button>
      <button
        class="minddoc-toolbar-btn"
        onClick={onCollapseAll}
        title="折叠全部"
      >
        折叠全部
      </button>
    </div>
  );
}
