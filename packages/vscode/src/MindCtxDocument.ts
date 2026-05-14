import * as vscode from 'vscode';
import {
  parse,
  serialize,
  applyOperation,
  invertOperation,
  fnv1a64,
  type MindCtxTree,
  type PartialOperation,
  type Operation,
} from '@mindctx/core';

/**
 * MindCtxDocument is the CustomDocument implementation for MindCtx.
 *
 * It holds file content, parsed tree, and integrates with VSCode's
 * undo/redo system via CustomDocumentEditEvent.
 */
export class MindCtxDocument implements vscode.CustomDocument {
  readonly uri: vscode.Uri;

  private _tree: MindCtxTree;
  private _contentHash: string;
  private _saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private _pendingSave = false;
  private _disposed = false;

  private readonly _onDidDispose = new vscode.EventEmitter<void>();
  readonly onDidDispose = this._onDidDispose.event;

  private readonly _onDidChangeContent = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<MindCtxDocument>>();
  readonly onDidChangeContent = this._onDidChangeContent.event;

  private readonly _onDidChangeTree = new vscode.EventEmitter<{ tree: MindCtxTree; reason: 'self' | 'undo' | 'redo' | 'externalChange' }>();
  readonly onDidChangeTree = this._onDidChangeTree.event;

  private constructor(uri: vscode.Uri, content: string) {
    this.uri = uri;
    this._tree = parse(content, { filePath: uri.fsPath });
    this._contentHash = fnv1a64(content);
  }

  /** Factory: create a document from a URI by reading its file content. */
  static async create(uri: vscode.Uri): Promise<MindCtxDocument> {
    const content = await MindCtxDocument.readFile(uri);
    return new MindCtxDocument(uri, content);
  }

  /** The current parsed tree. */
  get tree(): MindCtxTree {
    return this._tree;
  }

  /** Current content hash for external change detection. */
  get contentHash(): string {
    return this._contentHash;
  }

  /**
   * Apply a partial operation to the tree.
   *
   * On success, fires a CustomDocumentEditEvent so VSCode tracks the edit
   * in its undo stack. The event's undo/redo callbacks apply inverse/original
   * operations respectively.
   *
   * @returns The full Operation on success, or null on failure.
   */
  applyOperation(op: PartialOperation): Operation | null {
    try {
      const fullOp = applyOperation(this._tree, op);

      // Build inverse operations for undo
      const inverseOps = invertOperation(fullOp);

      // Fire edit event for VSCode's undo system
      this._onDidChangeContent.fire({
        document: this,
        undo: () => {
          for (const inv of inverseOps) {
            applyOperation(this._tree, inv);
          }
          this._onDidChangeTree.fire({ tree: this._tree, reason: 'undo' });
        },
        redo: () => {
          // Re-apply the original operation
          applyOperation(this._tree, op);
          this._onDidChangeTree.fire({ tree: this._tree, reason: 'redo' });
        },
      });

      this._onDidChangeTree.fire({ tree: this._tree, reason: 'self' });
      return fullOp;
    } catch {
      return null;
    }
  }

  /**
   * Save the document to disk.
   */
  async save(cancellation?: vscode.CancellationToken): Promise<void> {
    this._cancelScheduledSave();
    this._pendingSave = true;

    const content = serialize(this._tree);
    this._contentHash = fnv1a64(content);

    if (cancellation?.isCancellationRequested) {
      this._pendingSave = false;
      return;
    }

    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(this.uri, encoder.encode(content));
    this._pendingSave = false;
  }

  /**
   * Save to a different URI (Save As).
   */
  async saveAs(targetUri: vscode.Uri): Promise<void> {
    const content = serialize(this._tree);
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(targetUri, encoder.encode(content));
  }

  /**
   * Revert the document to the on-disk version.
   */
  async revert(): Promise<void> {
    this._cancelScheduledSave();
    const content = await MindCtxDocument.readFile(this.uri);
    this._tree = parse(content, { filePath: this.uri.fsPath });
    this._contentHash = fnv1a64(content);
    this._onDidChangeTree.fire({ tree: this._tree, reason: 'externalChange' });
  }

  /**
   * Schedule a debounced save. Multiple calls within the delay window
   * will reset the timer.
   *
   * @param delayMs Debounce delay in milliseconds (default 1500ms).
   */
  scheduleSave(delayMs = 1500): void {
    this._cancelScheduledSave();
    this._saveTimeout = setTimeout(() => {
      this._saveTimeout = null;
      this.save().catch(err => {
        console.error('[MindCtx] Auto-save failed:', err);
      });
    }, delayMs);
  }

  /**
   * Handle an external file change (e.g., from a file watcher).
   *
   * Returns null if there's a pending save (we ignore self-triggered events).
   * Otherwise, re-reads and re-parses the file, returning the new tree.
   */
  async handleExternalChange(): Promise<MindCtxTree | null> {
    // Ignore watcher events triggered by our own saves
    if (this._pendingSave || this._saveTimeout !== null) {
      return null;
    }

    const content = await MindCtxDocument.readFile(this.uri);
    const newHash = fnv1a64(content);

    // No actual change
    if (newHash === this._contentHash) {
      return null;
    }

    this._tree = parse(content, { filePath: this.uri.fsPath });
    this._contentHash = newHash;
    this._onDidChangeTree.fire({ tree: this._tree, reason: 'externalChange' });
    return this._tree;
  }

  /**
   * Dispose the document and release resources.
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._cancelScheduledSave();
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
    this._onDidChangeContent.dispose();
    this._onDidChangeTree.dispose();
  }

  // --- Private helpers ---

  private _cancelScheduledSave(): void {
    if (this._saveTimeout !== null) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
    }
  }

  private static async readFile(uri: vscode.Uri): Promise<string> {
    const data = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder('utf-8').decode(data);
  }
}
