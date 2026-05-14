import type { MindCtxTree, PartialOperation } from '@mindctx/core';

// --- Settings passed to Webview ---

export interface MindCtxSettings {
  defaultView: 'outline' | 'mindmap';
  headingDepth: number;
  autoSaveDelay: number;
  outlineFontSize: number;
  showNotePreview: boolean;
  mindmapDirection: 'side' | 'right' | 'left';
}

// --- Theme colors ---

export interface ThemeColors {
  kind: 'light' | 'dark' | 'high-contrast';
  foreground: string;
  background: string;
  accent: string;
  border: string;
  nodeBackground: string;
  selectedBackground: string;
}

// --- View state ---

export interface PersistedViewState {
  collapsedNodeIds: string[];
  activeView: 'outline' | 'mindmap';
}

export interface TransientViewState {
  collapsedNodeIds: string[];
  selectedNodeId: string | null;
  activeView: 'outline' | 'mindmap';
  scrollPosition: number;
}

// --- Commands sent to Webview ---

export type WebviewCommand =
  | { name: 'expandAll' }
  | { name: 'collapseAll' }
  | { name: 'toggleView' }
  | { name: 'export.png' };

// --- Extension → Webview messages ---

export type ExtToWebview =
  | { type: 'init'; tree: MindCtxTree; settings: MindCtxSettings; state: PersistedViewState | null }
  | { type: 'treeUpdated'; tree: MindCtxTree; reason: 'self' | 'peerEdit' | 'undo' | 'redo' | 'externalChange' }
  | { type: 'themeChanged'; colors: ThemeColors }
  | { type: 'settingsChanged'; settings: Partial<MindCtxSettings> }
  | { type: 'command'; command: WebviewCommand }
  | { type: 'error'; message: string; operationId?: string };

// --- Webview → Extension messages ---

export type WebviewToExt =
  | { type: 'ready' }
  | { type: 'operation'; op: PartialOperation; operationId: string }
  | { type: 'stateSync'; state: TransientViewState }
  | { type: 'exportResult'; format: 'png'; data: string }
  | { type: 'requestSave' };
