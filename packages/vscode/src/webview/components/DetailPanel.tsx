import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { MindCtxNode } from '@mindctx/core';

interface DetailPanelProps {
  node: MindCtxNode | null;
  onUpdateNote: (nodeId: string, newNote: string) => void;
}

export function DetailPanel({ node, onUpdateNote }: DetailPanelProps) {
  if (!node) return null;

  const [localNote, setLocalNote] = useState(node.note);

  useEffect(() => {
    setLocalNote(node.note);
  }, [node.id, node.note]);

  return (
    <div class="mindctx-detail-panel">
      <div class="mindctx-detail-note">
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
        <div class="mindctx-detail-blocks">
          {node.blocks.map((block, i) => (
            <pre key={i} class={`mindctx-block mindctx-block-${block.type}`}>
              <code>{block.raw}</code>
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}
