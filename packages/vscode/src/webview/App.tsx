import { h } from 'preact';
import { WebviewBridge } from './WebviewBridge.js';

const bridge = new WebviewBridge();

export function App() {
  const tree = bridge.tree.value;

  if (!tree) {
    return <div class="loading">Loading...</div>;
  }

  return (
    <div class="minddoc-root">
      <div class="placeholder">
        <h1>{tree.root.title}</h1>
        <p>Nodes: {tree.metadata.nodeCount} | Depth: {tree.metadata.maxDepth}</p>
        <p>View: {bridge.activeView.value}</p>
        <p style="opacity: 0.5;">Outline and Mind Map views coming in Phase 2-3.</p>
      </div>
    </div>
  );
}
