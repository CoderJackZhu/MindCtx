import { h } from 'preact';
import { render } from 'preact';
import { signal } from '@preact/signals';
import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import { parse } from '../core/parser.js';
import { serialize } from '../core/serializer.js';
import { applyOperation } from '../core/operations.js';
import { UndoManager } from '../core/undo.js';
import type { MindDocTree, MindDocNode, PartialOperation } from '../core/types.js';
import { MINDDOC_VIEW_TYPE } from '../constants.js';
import { debounce } from '../utils/debounce.js';
import { MindDocRoot } from './MindDocRoot.js';
import type MindDocPlugin from '../main.js';

export class MindDocView extends ItemView {
  plugin: MindDocPlugin;
  file: TFile | null = null;
  tree: MindDocTree | null = null;
  undoManager = new UndoManager();

  treeSignal = signal<MindDocTree | null>(null);
  collapsedIds = signal<Set<string>>(new Set());
  selectedNodeId = signal<string | null>(null);
  editingNodeId = signal<string | null>(null);

  private preactMounted = false;
  private debouncedWrite: ReturnType<typeof debounce> | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: MindDocPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return MINDDOC_VIEW_TYPE; }
  getDisplayText() { return this.file?.basename ?? 'MindDoc'; }
  getIcon() { return 'list-tree'; }

  getState() {
    return { file: this.file?.path ?? '' };
  }

  async setState(state: { file?: string }, result: any) {
    if (state.file) {
      const file = this.app.vault.getAbstractFileByPath(state.file);
      if (file instanceof TFile) {
        this.file = file;
        await this.loadFile();
        this.renderView();
      }
    }
    return super.setState(state, result);
  }

  async onOpen() {
    this.debouncedWrite = debounce(() => this.writeFile(), this.plugin.settings.autoSaveDelay, { maxWait: 2000 });

    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (file !== this.file) return;
        const lastWrite = this.plugin.recentWrites.get(file.path);
        if (lastWrite && Date.now() - lastWrite < 200) return;

        const content = await this.app.vault.read(file as TFile);
        this.tree = parse(content, { filePath: file.path });
        this.treeSignal.value = this.tree;
        this.undoManager.clear();
      })
    );

    this.renderView();
  }

  async onClose() {
    this.debouncedWrite?.cancel();
    const container = this.containerEl.children[1];
    if (container) render(null, container);
    this.preactMounted = false;
  }

  async loadFile() {
    if (!this.file) return;
    const content = await this.app.vault.read(this.file);
    this.tree = parse(content, { filePath: this.file.path });
    this.treeSignal.value = this.tree;
    this.undoManager.clear();
  }

  scheduleWrite() {
    this.debouncedWrite?.();
  }

  async writeFile() {
    if (!this.file || !this.tree) return;
    const content = serialize(this.tree);
    this.plugin.recentWrites.set(this.file.path, Date.now());
    await this.app.vault.modify(this.file, content);
  }

  executeOperation(op: PartialOperation) {
    if (!this.tree) return;
    const fullOp = applyOperation(this.tree, op);
    this.undoManager.push([fullOp]);
    this.treeSignal.value = { ...this.tree };
    this.scheduleWrite();
  }

  undo() {
    if (!this.tree) return;
    this.undoManager.undo(this.tree);
    this.treeSignal.value = { ...this.tree };
    this.scheduleWrite();
  }

  redo() {
    if (!this.tree) return;
    this.undoManager.redo(this.tree);
    this.treeSignal.value = { ...this.tree };
    this.scheduleWrite();
  }

  renderView() {
    const container = this.containerEl.children[1];
    if (!container) return;

    if (!this.preactMounted) {
      render(
        h(MindDocRoot, {
          treeSignal: this.treeSignal,
          collapsedIds: this.collapsedIds,
          selectedNodeId: this.selectedNodeId,
          editingNodeId: this.editingNodeId,
          onOperation: (op: PartialOperation) => this.executeOperation(op),
          onUndo: () => this.undo(),
          onRedo: () => this.redo(),
          onExpandAll: () => { this.collapsedIds.value = new Set(); },
          onCollapseAll: () => {
            if (!this.tree) return;
            const ids = new Set<string>();
            function walk(node: MindDocNode) {
              if (node.children.length > 0) ids.add(node.id);
              node.children.forEach(walk);
            }
            this.tree.root.children.forEach(walk);
            this.collapsedIds.value = ids;
          },
        }),
        container
      );
      this.preactMounted = true;
    }
  }
}
