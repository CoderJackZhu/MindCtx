import { Plugin, WorkspaceLeaf, TFile, Notice, Menu } from 'obsidian';
import { MINDDOC_VIEW_TYPE } from './constants.js';
import { MindDocView } from './views/MindDocView.js';
import { MindDocSettingTab, DEFAULT_SETTINGS } from './settings/settings.js';
import { registerEmbedProcessor } from './views/EmbedProcessor.js';
import { importOPML } from './importers/opml.js';
import { importFreeMind } from './importers/freemind.js';
import { exportOPML } from './exporters/opml.js';
import { exportJSON } from './exporters/json.js';
import { exportPNG } from './exporters/image.js';
import { copyAsAIContext } from './commands/aiCommands.js';
import { parse } from './core/parser.js';
import type { MindDocSettings } from './settings/settings.js';
import type { MindDocNode } from './core/types.js';

export default class MindDocPlugin extends Plugin {
  settings!: MindDocSettings;
  recentWrites = new Map<string, number>();

  async onload() {
    await this.loadSettings();

    this.registerView(MINDDOC_VIEW_TYPE, (leaf) => new MindDocView(leaf, this));

    registerEmbedProcessor(this);

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

    this.addCommand({
      id: 'toggle-view',
      name: '切换视图（大纲 ↔ 脑图）',
      checkCallback: (checking) => {
        const view = this.getActiveMindDocView();
        if (!view) return false;
        if (checking) return true;
        view.switchView(view.currentViewSignal.value === 'outline' ? 'mindmap' : 'outline');
        return true;
      },
    });

    this.addCommand({
      id: 'import-opml',
      name: '导入 OPML 文件',
      callback: async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.opml,.xml';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const text = await file.text();
          const fileName = file.name.replace(/\.(opml|xml)$/, '') + '.mind.md';
          const markdown = importOPML(text, fileName);
          const newFile = await this.app.vault.create(fileName, markdown);
          await this.activateMindDocView(newFile);
          new Notice(`已导入: ${fileName}`);
        };
        input.click();
      },
    });

    this.addCommand({
      id: 'import-freemind',
      name: '导入 FreeMind 文件',
      callback: async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.mm';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const text = await file.text();
          const fileName = file.name.replace(/\.mm$/, '') + '.mind.md';
          const markdown = importFreeMind(text, fileName);
          const newFile = await this.app.vault.create(fileName, markdown);
          await this.activateMindDocView(newFile);
          new Notice(`已导入: ${fileName}`);
        };
        input.click();
      },
    });

    this.addCommand({
      id: 'export-opml',
      name: '导出为 OPML',
      checkCallback: (checking) => {
        const view = this.getActiveMindDocView();
        if (!view?.tree) return false;
        if (checking) return true;
        const opml = exportOPML(view.tree);
        this.saveExportFile(opml, view.file!.basename + '.opml', view.file!);
        return true;
      },
    });

    this.addCommand({
      id: 'export-json',
      name: '导出为 JSON',
      checkCallback: (checking) => {
        const view = this.getActiveMindDocView();
        if (!view?.tree) return false;
        if (checking) return true;
        const json = exportJSON(view.tree);
        this.saveExportFile(json, view.file!.basename + '.json', view.file!);
        return true;
      },
    });

    this.addCommand({
      id: 'export-png',
      name: '导出为 PNG',
      checkCallback: (checking) => {
        const view = this.getActiveMindDocView();
        if (!view?.tree || view.currentViewSignal.value !== 'mindmap') return false;
        if (checking) return true;
        const container = view.containerEl.querySelector('.minddoc-mindmap-container') as HTMLElement;
        if (!container) return false;
        exportPNG(container).then((blob) => {
          this.saveExportBlob(blob, view.file!.basename + '.png');
        });
        return true;
      },
    });

    this.addCommand({
      id: 'copy-ai-context',
      name: '复制为 AI 上下文',
      checkCallback: (checking) => {
        const view = this.getActiveMindDocView();
        if (!view?.tree) return false;
        if (checking) return true;
        const text = copyAsAIContext(view.tree);
        navigator.clipboard.writeText(text);
        new Notice('已复制到剪贴板');
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu: Menu, file: any) => {
        if (file instanceof TFile && file.path.endsWith('.md')) {
          menu.addItem((item: any) => {
            item.setTitle('以 MindDoc 打开')
              .setIcon('list-tree')
              .onClick(() => this.activateMindDocView(file));
          });
        }

        if (file instanceof TFile && this.isMindDocFile(file)) {
          menu.addItem((item: any) => {
            item.setTitle('导出为 OPML')
              .setIcon('download')
              .onClick(async () => {
                const content = await this.app.vault.read(file);
                const tree = parse(content, { filePath: file.path });
                const opml = exportOPML(tree);
                await this.saveExportFile(opml, file.basename + '.opml', file);
              });
          });
        }
      })
    );

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

  async saveExportFile(content: string, defaultName: string, sourceFile: TFile) {
    const folder = sourceFile.parent?.path || '';
    const exportPath = folder ? `${folder}/${defaultName}` : defaultName;
    await this.app.vault.adapter.write(exportPath, content);
    new Notice(`已导出: ${exportPath}`);
  }

  async saveExportBlob(blob: Blob, defaultName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
    new Notice(`已导出: ${defaultName}`);
  }
}
