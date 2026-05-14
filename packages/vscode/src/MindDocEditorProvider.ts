import * as vscode from 'vscode';
import { MindDocDocument } from './MindDocDocument';
import type {
  ExtToWebview,
  WebviewToExt,
  MindDocSettings,
  ThemeColors,
  PersistedViewState,
} from './types/messages';

/**
 * MindDocEditorProvider implements the CustomEditorProvider for `.mind.md` files.
 *
 * It manages the lifecycle of MindDocDocument instances, webview panels,
 * multi-webview synchronization, theme detection, and file watching.
 */
export class MindDocEditorProvider
  implements vscode.CustomEditorProvider<MindDocDocument>
{
  static readonly viewType = 'minddoc.editor';

  /** Maps a document to the set of webview panels displaying it. */
  private readonly _documentPanels = new Map<MindDocDocument, Set<vscode.WebviewPanel>>();

  /** Maps a document to its file system watcher. */
  private readonly _watchers = new Map<MindDocDocument, vscode.FileSystemWatcher>();

  /** Disposables owned by this provider. */
  private readonly _disposables: vscode.Disposable[] = [];

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<MindDocDocument>
  >();
  readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly _context: vscode.ExtensionContext) {
    // Listen for theme changes and broadcast to all webviews
    this._disposables.push(
      vscode.window.onDidChangeActiveColorTheme(() => {
        const colors = this._getThemeColors();
        for (const [, panels] of this._documentPanels) {
          for (const panel of panels) {
            this._postMessage(panel.webview, { type: 'themeChanged', colors });
          }
        }
      })
    );

    // Listen for configuration changes
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('minddoc')) {
          const settings = this._getSettings();
          for (const [, panels] of this._documentPanels) {
            for (const panel of panels) {
              this._postMessage(panel.webview, {
                type: 'settingsChanged',
                settings,
              });
            }
          }
        }
      })
    );
  }

  /**
   * Static helper to register this provider with the extension context.
   * Returns a Disposable that can be added to the extension subscriptions.
   */
  static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MindDocEditorProvider(context);
    const registration = vscode.window.registerCustomEditorProvider(
      MindDocEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: true,
      }
    );
    return vscode.Disposable.from(registration, {
      dispose: () => provider.dispose(),
    });
  }

  // --- CustomEditorProvider implementation ---

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<MindDocDocument> {
    const document = await MindDocDocument.create(uri);

    // Set up file system watcher for external changes
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(uri, '*')
    );

    // We only care about changes to this specific file
    const changeDisposable = vscode.workspace.createFileSystemWatcher(
      uri.fsPath
    );
    changeDisposable.onDidChange(async () => {
      await document.handleExternalChange();
    });

    this._watchers.set(document, changeDisposable);

    // Forward document edit events to VSCode's undo system
    const editListener = document.onDidChangeContent((e) => {
      this._onDidChangeCustomDocument.fire(e);
    });

    // Listen for tree changes to broadcast to webviews
    const treeListener = document.onDidChangeTree(({ tree, reason }) => {
      // Only broadcast undo/redo/externalChange here.
      // 'self' is handled directly in the operation message handler.
      if (reason === 'undo' || reason === 'redo' || reason === 'externalChange') {
        const panels = this._documentPanels.get(document);
        if (panels) {
          for (const panel of panels) {
            this._postMessage(panel.webview, {
              type: 'treeUpdated',
              tree,
              reason,
            });
          }
        }
      }
    });

    // Clean up on document dispose
    document.onDidDispose(() => {
      editListener.dispose();
      treeListener.dispose();
      const w = this._watchers.get(document);
      if (w) {
        w.dispose();
        this._watchers.delete(document);
      }
      watcher.dispose();
      this._documentPanels.delete(document);
    });

    this._documentPanels.set(document, new Set());

    return document;
  }

  async resolveCustomEditor(
    document: MindDocDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Track this panel
    const panels = this._documentPanels.get(document);
    if (panels) {
      panels.add(webviewPanel);
    }

    // Configure webview
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._context.extensionUri, 'dist'),
      ],
    };

    // Set HTML content
    webviewPanel.webview.html = this._getHtmlForWebview(webviewPanel.webview);

    // Handle messages from webview
    const messageListener = webviewPanel.webview.onDidReceiveMessage(
      (message: WebviewToExt) => {
        this._handleWebviewMessage(document, webviewPanel, message);
      }
    );

    // Clean up when panel is disposed
    webviewPanel.onDidDispose(() => {
      messageListener.dispose();
      const p = this._documentPanels.get(document);
      if (p) {
        p.delete(webviewPanel);
      }
    });
  }

  async saveCustomDocument(
    document: MindDocDocument,
    cancellation: vscode.CancellationToken
  ): Promise<void> {
    await document.save(cancellation);
  }

  async saveCustomDocumentAs(
    document: MindDocDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    await document.saveAs(destination);
  }

  async revertCustomDocument(
    document: MindDocDocument,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    await document.revert();
  }

  async backupCustomDocument(
    document: MindDocDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    // Save current content to backup location
    await document.saveAs(context.destination);
    return {
      id: context.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(context.destination);
        } catch {
          // Best effort
        }
      },
    };
  }

  dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
    for (const [, watcher] of this._watchers) {
      watcher.dispose();
    }
    this._watchers.clear();
  }

  // --- Message handling ---

  private async _handleWebviewMessage(
    document: MindDocDocument,
    panel: vscode.WebviewPanel,
    message: WebviewToExt
  ): Promise<void> {
    switch (message.type) {
      case 'ready': {
        const state = this._getPersistedState(document.uri);
        const settings = this._getSettings();
        this._postMessage(panel.webview, {
          type: 'init',
          tree: document.tree,
          settings,
          state,
        });
        // Also send current theme
        this._postMessage(panel.webview, {
          type: 'themeChanged',
          colors: this._getThemeColors(),
        });
        break;
      }

      case 'operation': {
        const result = document.applyOperation(message.op);
        if (result) {
          // Broadcast to all panels for this document
          const panels = this._documentPanels.get(document);
          if (panels) {
            for (const p of panels) {
              const reason = p === panel ? 'self' : 'peerEdit';
              this._postMessage(p.webview, {
                type: 'treeUpdated',
                tree: document.tree,
                reason,
              });
            }
          }
        } else {
          // Operation failed — send error and resync the source webview
          this._postMessage(panel.webview, {
            type: 'error',
            message: 'Operation failed',
            operationId: message.operationId,
          });
          this._postMessage(panel.webview, {
            type: 'treeUpdated',
            tree: document.tree,
            reason: 'self',
          });
        }
        break;
      }

      case 'stateSync': {
        const persistedState: PersistedViewState = {
          collapsedNodeIds: message.state.collapsedNodeIds,
          activeView: message.state.activeView,
        };
        this._persistState(document.uri, persistedState);
        break;
      }

      case 'exportResult': {
        if (message.format === 'png') {
          await this._handlePngExport(document, message.data);
        }
        break;
      }

      case 'requestSave': {
        await document.save();
        break;
      }
    }
  }

  // --- PNG export ---

  private async _handlePngExport(
    document: MindDocDocument,
    dataUrl: string
  ): Promise<void> {
    // dataUrl format: "data:image/png;base64,<base64data>"
    const base64Marker = 'base64,';
    const base64Index = dataUrl.indexOf(base64Marker);
    if (base64Index === -1) {
      vscode.window.showErrorMessage('Invalid PNG export data.');
      return;
    }

    const base64Data = dataUrl.slice(base64Index + base64Marker.length);
    const binaryData = Buffer.from(base64Data, 'base64');

    // Suggest filename from document name
    const docName = document.uri.path.split('/').pop()?.replace(/\.mind\.md$/, '') ?? 'mindmap';
    const defaultUri = vscode.Uri.joinPath(
      vscode.Uri.file(document.uri.fsPath).with({ path: document.uri.path.replace(/[^/]+$/, '') }),
      `${docName}.png`
    );

    const saveUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { 'PNG Image': ['png'] },
    });

    if (saveUri) {
      await vscode.workspace.fs.writeFile(saveUri, binaryData);
      vscode.window.showInformationMessage(`Exported to ${saveUri.fsPath}`);
    }
  }

  // --- State persistence ---

  private _getPersistedState(uri: vscode.Uri): PersistedViewState | null {
    const key = `minddoc:viewState:${uri.fsPath}`;
    return this._context.workspaceState.get<PersistedViewState>(key) ?? null;
  }

  private _persistState(uri: vscode.Uri, state: PersistedViewState): void {
    const key = `minddoc:viewState:${uri.fsPath}`;
    this._context.workspaceState.update(key, state);
  }

  // --- Settings ---

  private _getSettings(): MindDocSettings {
    const config = vscode.workspace.getConfiguration('minddoc');
    return {
      defaultView: config.get<'outline' | 'mindmap'>('defaultView', 'outline'),
      headingDepth: config.get<number>('headingDepth', 3),
      autoSaveDelay: config.get<number>('autoSaveDelay', 300),
      outlineFontSize: config.get<number>('outlineFontSize', 14),
      showNotePreview: config.get<boolean>('showNotePreview', true),
      mindmapDirection: config.get<'side' | 'right' | 'left'>('mindmapDirection', 'side'),
    };
  }

  // --- Theme ---

  private _getThemeColors(): ThemeColors {
    const kind = vscode.window.activeColorTheme.kind;

    switch (kind) {
      case vscode.ColorThemeKind.Light:
        return {
          kind: 'light',
          foreground: '#1e1e1e',
          background: '#ffffff',
          accent: '#0078d4',
          border: '#e0e0e0',
          nodeBackground: '#f5f5f5',
          selectedBackground: '#e8f0fe',
        };
      case vscode.ColorThemeKind.HighContrast:
      case vscode.ColorThemeKind.HighContrastLight:
        return {
          kind: 'high-contrast',
          foreground: '#ffffff',
          background: '#000000',
          accent: '#1aebff',
          border: '#6fc3df',
          nodeBackground: '#1a1a1a',
          selectedBackground: '#0f4a7a',
        };
      case vscode.ColorThemeKind.Dark:
      default:
        return {
          kind: 'dark',
          foreground: '#cccccc',
          background: '#1e1e1e',
          accent: '#4fc1ff',
          border: '#3c3c3c',
          nodeBackground: '#2d2d2d',
          selectedBackground: '#094771',
        };
    }
  }

  // --- Webview HTML ---

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'dist', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'dist', 'webview.css')
    );

    const cspSource = webview.cspSource;
    const nonce = this._getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${cspSource}; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:; font-src ${cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>MindDoc</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  // --- Helpers ---

  private _postMessage(webview: vscode.Webview, message: ExtToWebview): void {
    webview.postMessage(message);
  }
}
