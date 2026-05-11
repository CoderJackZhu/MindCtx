import { Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import { MINDDOC_VIEW_TYPE } from './constants.js';
import { MindDocView } from './views/MindDocView.js';
import { MindDocSettingTab, DEFAULT_SETTINGS } from './settings/settings.js';
import type { MindDocSettings } from './settings/settings.js';
import type { MindDocNode } from './core/types.js';

export default class MindDocPlugin extends Plugin {
  settings!: MindDocSettings;
  recentWrites = new Map<string, number>();

  async onload() {
    await this.loadSettings();

    this.registerView(MINDDOC_VIEW_TYPE, (leaf) => new MindDocView(leaf, this));

    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file && this.isMindDocFile(file)) {
          this.activateMindDocView(file);
        }
      })
    );

    this.addCommand({
      id: 'create',
      name: '创建 MindDoc 文件',
      callback: () => this.createNewMindDoc(),
    });

    this.addCommand({
      id: 'open-as-minddoc',
      name: '以 MindDoc 打开当前文件',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !file.path.endsWith('.md')) return false;
        if (checking) return true;
        this.activateMindDocView(file);
        return true;
      },
    });

    this.addCommand({
      id: 'expand-all',
      name: '展开全部节点',
      checkCallback: (checking) => {
        const view = this.getActiveMindDocView();
        if (!view) return false;
        if (checking) return true;
        view.collapsedIds.value = new Set();
        return true;
      },
    });

    this.addCommand({
      id: 'collapse-all',
      name: '折叠全部节点',
      checkCallback: (checking) => {
        const view = this.getActiveMindDocView();
        if (!view?.tree) return false;
        if (checking) return true;
        const ids = new Set<string>();
        function walk(node: MindDocNode) {
          if (node.children.length > 0) ids.add(node.id);
          node.children.forEach(walk);
        }
        view.tree.root.children.forEach(walk);
        view.collapsedIds.value = ids;
        return true;
      },
    });

    this.addSettingTab(new MindDocSettingTab(this.app, this));
  }

  isMindDocFile(file: TFile): boolean {
    if (file.path.endsWith('.mind.md')) return true;
    const cache = this.app.metadataCache.getFileCache(file);
    return cache?.frontmatter?.minddoc === true;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateMindDocView(file: TFile) {
    const existing = this.app.workspace.getLeavesOfType(MINDDOC_VIEW_TYPE)
      .find(leaf => (leaf.view as MindDocView).file?.path === file.path);
    if (existing) {
      this.app.workspace.setActiveLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: MINDDOC_VIEW_TYPE, state: { file: file.path } });
  }

  async createNewMindDoc() {
    const fileName = `新建文档 ${Date.now()}.mind.md`;
    const content = `---\nminddoc: true\ndefault-view: outline\n---\n\n# ${fileName.replace('.mind.md', '')}\n\n## 主题一\n\n## 主题二\n`;
    const file = await this.app.vault.create(fileName, content);
    await this.activateMindDocView(file);
  }

  getActiveMindDocView(): MindDocView | null {
    const leaf = this.app.workspace.activeLeaf;
    if (leaf?.view instanceof MindDocView) {
      return leaf.view as MindDocView;
    }
    return null;
  }
}
