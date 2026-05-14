// Bridge entry point - browser-only (depends on mind-elixir which requires DOM)
export {
  getMindElixirDirection,
  treeToMindElixirData,
  syncMindElixirAddChildButtons,
  setupMindElixirEvents,
} from './bridge/mindElixirBridge.js';
