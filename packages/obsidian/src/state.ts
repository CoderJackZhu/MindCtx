import type MindCtxPlugin from './main.js';

interface PluginState {
  collapsedNodes: {
    [filePath: string]: string[];
  };
}

const STATE_FILE = 'state.json';

export async function loadState(plugin: MindCtxPlugin): Promise<PluginState> {
  const path = `${plugin.manifest.dir}/${STATE_FILE}`;
  try {
    const data = await plugin.app.vault.adapter.read(path);
    return JSON.parse(data);
  } catch {
    return { collapsedNodes: {} };
  }
}

export async function saveState(plugin: MindCtxPlugin, state: PluginState): Promise<void> {
  const path = `${plugin.manifest.dir}/${STATE_FILE}`;
  await plugin.app.vault.adapter.write(path, JSON.stringify(state, null, 2));
}

export function getCollapsedIds(state: PluginState, filePath: string): Set<string> {
  const ids = state.collapsedNodes[filePath];
  return ids ? new Set(ids) : new Set();
}

export function setCollapsedIds(state: PluginState, filePath: string, ids: Set<string>): PluginState {
  return {
    ...state,
    collapsedNodes: {
      ...state.collapsedNodes,
      [filePath]: Array.from(ids),
    },
  };
}
