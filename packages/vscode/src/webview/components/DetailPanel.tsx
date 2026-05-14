import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { MindDocNode } from '@minddoc/core';

interface DetailPanelProps {
  node: MindDocNode | null;
  onUpdateNote: (nodeId: string, newNote: string) => void;
}

export function DetailPanel({ node, onUpdateNote }: DetailPanelProps) {
  if (!node) return null;

  const [localNote, setLocalNote] = useState(node.note);

  useEffect(() => {
    setLocalNote(node.note);
  }, [node.id, node.note]);

  return (
    <div class="minddoc-detail-panel">
      <div class="minddoc-detail-note">
        <textarea
          value={localNote}
          placeholder="Add note..."
          onInput={(e) => setLocalNote((e.target as HTMLTextAreaElement).value)}
          onBlur={(e) => {
            if ((e.target as HTMLTextAreaElement).value !== node.note) {
              onUpdateNote(node.id, (e.target as HTMLTextAreaElement).value);
            }
          }}
        />
      </div>
      {node.blocks.length > 0 && (
        <div class="minddoc-detail-blocks">
          {node.blocks.map((block, i) => (
            <pre key={i} class={`minddoc-block minddoc-block-${block.type}`}>
              <code>{block.raw}</code>
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}
