import { signal, type Signal } from '@preact/signals';
import type { MindDocTree, PartialOperation } from '@minddoc/core';
import type { ExtToWebview, WebviewToExt, MindDocSettings, ThemeColors, TransientViewState, WebviewCommand, PersistedViewState } from '../types/messages.js';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
let operationCounter = 0;

export class WebviewBridge {
  readonly tree: Signal<MindDocTree | null> = signal(null);
  readonly settings: Signal<MindDocSettings> = signal({
    defaultView: 'outline',
    headingDepth: 3,
    autoSaveDelay: 300,
    outlineFontSize: 14,
    showNotePreview: true,
    mindmapDirection: 'side',
  });
  readonly theme: Signal<ThemeColors> = signal({
    kind: 'dark',
    foreground: '#cccccc',
    background: '#1e1e1e',
    accent: '#569cd6',
    border: '#3c3c3c',
    nodeBackground: '#2d2d2d',
    selectedBackground: '#094771',
  });
  readonly activeView: Signal<'outline' | 'mindmap'> = signal('outline');

  private _commandHandlers: Array<(cmd: WebviewCommand) => void> = [];

  constructor() {
    window.addEventListener('message', (event: MessageEvent<ExtToWebview>) => {
      this.handleMessage(event.data);
    });
    this.post({ type: 'ready' });
  }

  executeOperation(op: PartialOperation): void {
    const operationId = `op-${++operationCounter}`;
    this.post({ type: 'operation', op, operationId });
  }

  syncState(state: Partial<TransientViewState>): void {
    const full: TransientViewState = {
      collapsedNodeIds: state.collapsedNodeIds ?? [],
      selectedNodeId: state.selectedNodeId ?? null,
      activeView: state.activeView ?? this.activeView.value,
      scrollPosition: state.scrollPosition ?? 0,
    };
    this.post({ type: 'stateSync', state: full });
  }

  sendExportResult(format: 'png', data: string): void {
    this.post({ type: 'exportResult', format, data });
  }

  requestSave(): void {
    this.post({ type: 'requestSave' });
  }

  onCommand(handler: (cmd: WebviewCommand) => void): () => void {
    this._commandHandlers.push(handler);
    return () => {
      const idx = this._commandHandlers.indexOf(handler);
      if (idx >= 0) this._commandHandlers.splice(idx, 1);
    };
  }

  private handleMessage(msg: ExtToWebview): void {
    switch (msg.type) {
      case 'init':
        this.tree.value = msg.tree;
        this.settings.value = msg.settings;
        if (msg.state) {
          this.activeView.value = msg.state.activeView;
        }
        break;
      case 'treeUpdated':
        this.tree.value = msg.tree;
        break;
      case 'themeChanged':
        this.theme.value = msg.colors;
        break;
      case 'settingsChanged':
        this.settings.value = { ...this.settings.value, ...msg.settings };
        break;
      case 'command':
        for (const handler of this._commandHandlers) {
          handler(msg.command);
        }
        break;
      case 'error':
        console.warn('[MindDoc] Operation error:', msg.message);
        break;
    }
  }

  private post(msg: WebviewToExt): void {
    vscode.postMessage(msg);
  }
}
