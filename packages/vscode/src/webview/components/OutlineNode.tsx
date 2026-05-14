import { h } from 'preact';
import type { MindDocNode } from '@minddoc/core';
import { InlineEditor } from './InlineEditor.js';
import { DragIndicator } from './DragIndicator.js';

interface OutlineNodeProps {
  node: MindDocNode;
  depth: number;
  isSelected: boolean;
  isEditing: boolean;
  isCollapsed: boolean;
  indentSize: number;
  showNotePreview: boolean;
  dropPosition: 'before' | 'after' | 'child' | null;
  highlightQuery?: string;
  onSelect: () => void;
  onToggleCollapse: () => void;
  onStartEdit: () => void;
  onEndEdit: (newTitle: string) => void;
  onCancelEdit: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
}

function HighlightedTitle({ title, query }: { title: string; query: string }) {
  if (!query) return <span class="minddoc-title">{title}</span>;
  const lowerTitle = title.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerTitle.indexOf(lowerQuery);
  if (idx === -1) return <span class="minddoc-title">{title}</span>;

  return (
    <span class="minddoc-title">
      {title.slice(0, idx)}
      <mark class="minddoc-highlight">{title.slice(idx, idx + query.length)}</mark>
      {title.slice(idx + query.length)}
    </span>
  );
}

export function OutlineNode({
  node,
  depth,
  isSelected,
  isEditing,
  isCollapsed,
  indentSize,
  showNotePreview,
  dropPosition,
  highlightQuery,
  onSelect,
  onToggleCollapse,
  onStartEdit,
  onEndEdit,
  onCancelEdit,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onKeyDown,
}: OutlineNodeProps) {
  const hasChildren = node.children.length > 0;
  const paddingLeft = depth * indentSize;

  let className = 'minddoc-node';
  if (isSelected) className += ' is-selected';
  if (dropPosition === 'child') className += ' drop-highlight';

  return (
    <div
      class={className}
      style={{ paddingLeft: `${paddingLeft}px` }}
      onClick={onSelect}
      onDblClick={onStartEdit}
      onKeyDown={onKeyDown}
      draggable={!isEditing}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      tabIndex={0}
    >
      {dropPosition === 'before' && <DragIndicator position="before" />}

      <span class="minddoc-collapse-btn" onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}>
        {hasChildren ? (isCollapsed ? '▸' : '▾') : ' '}
      </span>

      <span class="minddoc-drag-handle">⋮⋮</span>

      {node.checked !== null ? (
        <input
          type="checkbox"
          class="minddoc-checkbox"
          checked={node.checked}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span class="minddoc-bullet" />
      )}

      {isEditing ? (
        <InlineEditor
          value={node.title}
          onConfirm={onEndEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        <HighlightedTitle title={node.title} query={highlightQuery || ''} />
      )}

      {!isEditing && showNotePreview && node.note && (
        <span class="minddoc-note-preview">{node.note.slice(0, 50)}</span>
      )}

      {dropPosition === 'after' && <DragIndicator position="after" />}
    </div>
  );
}
