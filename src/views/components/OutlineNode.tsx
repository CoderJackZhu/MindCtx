import { h } from 'preact';
import type { MindDocNode } from '../../core/types.js';
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

export function OutlineNode({
  node,
  depth,
  isSelected,
  isEditing,
  isCollapsed,
  indentSize,
  showNotePreview,
  dropPosition,
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

      {/* Collapse button */}
      <span class="minddoc-collapse-btn" onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}>
        {hasChildren ? (isCollapsed ? '▸' : '▾') : ' '}
      </span>

      {/* Drag handle */}
      <span class="minddoc-drag-handle">⋮⋮</span>

      {/* Checkbox or bullet */}
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

      {/* Title or editor */}
      {isEditing ? (
        <InlineEditor
          value={node.title}
          onConfirm={onEndEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        <span class="minddoc-title">{node.title}</span>
      )}

      {/* Note preview */}
      {!isEditing && showNotePreview && node.note && (
        <span class="minddoc-note-preview">{node.note.slice(0, 50)}</span>
      )}

      {dropPosition === 'after' && <DragIndicator position="after" />}
    </div>
  );
}
