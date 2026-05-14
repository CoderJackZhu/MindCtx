import { h } from 'preact';
import { signal } from '@preact/signals';
import { findNode } from '@minddoc/core';
import { WebviewBridge } from './WebviewBridge.js';
import { OutlineToolbar } from './components/OutlineToolbar.js';
import { OutlineView } from './OutlineView.js';
import { DetailPanel } from './components/DetailPanel.js';

const bridge = new WebviewBridge();

const collapsedIds = signal<Set<string>>(new Set());
const selectedNodeId = signal<string | null>(null);
const editingNodeId = signal<string | null>(null);

function getAllNodeIds(node: { id: string; children: { id: string; children: any[] }[] }): string[] {
  const ids: string[] = [];
  function walk(n: typeof node) {
    if (n.id) ids.push(n.id);
    n.children.forEach(walk);
  }
  walk(node);
  return ids;
}

bridge.onCommand((cmd) => {
  const tree = bridge.tree.value;
  switch (cmd.name) {
    case 'expandAll':
      collapsedIds.value = new Set();
      break;
    case 'collapseAll':
      if (tree) {
        collapsedIds.value = new Set(getAllNodeIds(tree.root));
      }
      break;
    case 'toggleView': {
      const next = bridge.activeView.value === 'outline' ? 'mindmap' : 'outline';
      bridge.activeView.value = next;
      bridge.syncState({ activeView: next });
      break;
    }
  }
});

export function App() {
  const tree = bridge.tree.value;
  const view = bridge.activeView.value;

  if (!tree) {
    return <div class="minddoc-loading">Loading...</div>;
  }

  const selectedNode = selectedNodeId.value ? findNode(tree.root, selectedNodeId.value) : null;

  return (
    <div class="minddoc-container">
      <OutlineToolbar
        currentView={view}
        onSwitchView={(v) => {
          bridge.activeView.value = v;
          bridge.syncState({ activeView: v });
        }}
        onExpandAll={() => { collapsedIds.value = new Set(); }}
        onCollapseAll={() => {
          collapsedIds.value = new Set(getAllNodeIds(tree.root));
        }}
      />
      <div class="minddoc-main-area">
        {view === 'outline' ? (
          <OutlineView
            bridge={bridge}
            collapsedIds={collapsedIds}
            selectedNodeId={selectedNodeId}
            editingNodeId={editingNodeId}
          />
        ) : (
          <div class="minddoc-loading">Mind Map view coming in Phase 3.</div>
        )}
      </div>
      {view === 'outline' && selectedNode && (
        <DetailPanel
          node={selectedNode}
          onUpdateNote={(nodeId, newNote) => {
            bridge.executeOperation({ type: 'updateNote', nodeId, note: newNote });
          }}
        />
      )}
    </div>
  );
}
