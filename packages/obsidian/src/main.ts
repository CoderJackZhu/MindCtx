import { Plugin, TFile, TAbstractFile, Notice, Menu } from 'obsidian';
import {
  parse,
  importOPML,
  importFreeMind,
  exportOPML,
  exportJSON,
  copyAsAIContext,
} from '@mindctx/core';
import type { MindCtxNode } from '@mindctx/core';
import { MINDCTX_VIEW_TYPE } from './constants.js';
import { MindCtxView } from './views/MindCtxView.js';
import { MindCtxSettingTab, DEFAULT_SETTINGS } from './settings/settings.js';
import { registerEmbedProcessor } from './views/EmbedProcessor.js';
import { exportPNG } from './exporters/image.js';
import type { MindCtxSettings } from './settings/settings.js';

export default class MindCtxPlugin extends Plugin {
  settings!: MindCtxSettings;
  recentWrites = new Map<string, number>();

  async onload() {
    await this.loadSettings();

    this.registerView(MINDCTX_VIEW_TYPE, (leaf) => new MindCtxView(leaf, this));

    registerEmbedProcessor(this);

    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file && this.isMindCtxFile(file)) {
          void this.activateMindCtxView(file);
        }
      })
    );

    this.addCommand({
      id: 'create',
      name: '创建文件',
      callback: () => { void this.createNewMindCtx(); },
    });

    this.addCommand({
      id: 'open-current',
      name: '以大纲打开当前文件',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !file.path.endsWith('.md')) return false;
        if (checking) return true;
        void this.activateMindCtxView(file);
        return true;
      },
    });

    this.addCommand({
      id: 'expand-all',
      name: '展开全部节点',
      checkCallback: (checking) => {
        const view = this.getActiveMindCtxView();
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
        const view = this.getActiveMindCtxView();
        if (!view?.tree) return false;
        if (checking) return true;
        const ids = new Set<string>();
        function walk(node: MindCtxNode) {
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
        const view = this.getActiveMindCtxView();
        if (!view) return false;
        if (checking) return true;
        view.switchView(view.currentViewSignal.value === 'outline' ? 'mindmap' : 'outline');
        return true;
      },
    });

    this.addCommand({
      id: 'import-opml',
      name: '导入 opml 文件',
      callback: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.opml,.xml';
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return;
          void file.text().then(async (text) => {
            const fileName = file.name.replace(/\.(opml|xml)$/, '') + '.mind.md';
            const markdown = importOPML(text, fileName);
            const newFile = await this.app.vault.create(fileName, markdown);
            await this.activateMindCtxView(newFile);
            new Notice(`已导入: ${fileName}`);
          });
        };
        input.click();
      },
    });

    this.addCommand({
      id: 'import-freemind',
      name: '导入 freemind 文件',
      callback: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.mm';
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return;
          void file.text().then(async (text) => {
            const fileName = file.name.replace(/\.mm$/, '') + '.mind.md';
            const markdown = importFreeMind(text, fileName);
            const newFile = await this.app.vault.create(fileName, markdown);
            await this.activateMindCtxView(newFile);
            new Notice(`已导入: ${fileName}`);
          });
        };
        input.click();
      },
    });

    this.addCommand({
      id: 'export-opml',
      name: '导出为 opml',
      checkCallback: (checking) => {
        const view = this.getActiveMindCtxView();
        if (!view?.tree) return false;
        if (checking) return true;
        const opml = exportOPML(view.tree);
        void this.saveExportFile(opml, view.file!.basename + '.opml', view.file!);
        return true;
      },
    });

    this.addCommand({
      id: 'export-json',
      name: '导出为 JSON',
      checkCallback: (checking) => {
        const view = this.getActiveMindCtxView();
        if (!view?.tree) return false;
        if (checking) return true;
        const json = exportJSON(view.tree);
        void this.saveExportFile(json, view.file!.basename + '.json', view.file!);
        return true;
      },
    });

    this.addCommand({
      id: 'export-png',
      name: '导出为 PNG',
      checkCallback: (checking) => {
        const view = this.getActiveMindCtxView();
        if (!view?.tree || view.currentViewSignal.value !== 'mindmap') return false;
        if (checking) return true;
        const container = view.containerEl.querySelector('.mindctx-mindmap-container') as HTMLElement;
        if (!container) return false;
        void exportPNG(container).then((blob) => {
          this.saveExportBlob(blob, view.file!.basename + '.png');
        });
        return true;
      },
    });

    this.addCommand({
      id: 'copy-ai-context',
      name: '复制为 AI 上下文',
      checkCallback: (checking) => {
        const view = this.getActiveMindCtxView();
        if (!view?.tree) return false;
        if (checking) return true;
        const text = copyAsAIContext(view.tree);
        void navigator.clipboard.writeText(text);
        new Notice('已复制到剪贴板');
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
        if (file instanceof TFile && file.path.endsWith('.md')) {
          menu.addItem((item) => {
            item.setTitle('以大纲打开')
              .setIcon('list-tree')
              .onClick(() => { void this.activateMindCtxView(file, 'outline'); });
          });
          menu.addItem((item) => {
            item.setTitle('以脑图打开')
              .setIcon('git-fork')
              .onClick(() => { void this.activateMindCtxView(file, 'mindmap'); });
          });
        }

        if (file instanceof TFile && this.isMindCtxFile(file)) {
          menu.addItem((item) => {
            item.setTitle('复制为 AI 上下文')
              .setIcon('sparkles')
              .onClick(() => {
                void this.app.vault.read(file).then((content) => {
                  const tree = parse(content, { filePath: file.path });
                  const text = copyAsAIContext(tree);
                  void navigator.clipboard.writeText(text);
                  new Notice('已复制到剪贴板');
                });
              });
          });
          menu.addItem((item) => {
            item.setTitle('导出为 opml')
              .setIcon('download')
              .onClick(() => {
                void this.app.vault.read(file).then(async (content) => {
                  const tree = parse(content, { filePath: file.path });
                  const opml = exportOPML(tree);
                  await this.saveExportFile(opml, file.basename + '.opml', file);
                });
              });
          });
        }
      })
    );

    this.addSettingTab(new MindCtxSettingTab(this.app, this));
  }

  isMindCtxFile(file: TFile): boolean {
    if (file.path.endsWith('.mind.md')) return true;
    const cache = this.app.metadataCache.getFileCache(file);
    return cache?.frontmatter?.mindctx === true;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateMindCtxView(file: TFile, view?: 'outline' | 'mindmap') {
    const existing = this.app.workspace.getLeavesOfType(MINDCTX_VIEW_TYPE)
      .find(leaf => {
        const v = leaf.view;
        return v instanceof MindCtxView && v.file?.path === file.path;
      });
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      if (view) (existing.view as MindCtxView).switchView(view);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: MINDCTX_VIEW_TYPE, state: { file: file.path, view } });
  }

  async createNewMindCtx() {
    const fileName = `新建文档 ${Date.now()}.mind.md`;
    const content = `---\nmindctx: true\ndefault-view: outline\n---\n\n# ${fileName.replace('.mind.md', '')}\n\n## 主题一\n\n## 主题二\n`;
    const file = await this.app.vault.create(fileName, content);
    await this.activateMindCtxView(file);
  }

  getActiveMindCtxView(): MindCtxView | null {
    const view = this.app.workspace.getActiveViewOfType(MindCtxView);
    return view ?? null;
  }

  async saveExportFile(content: string, defaultName: string, sourceFile: TFile) {
    const folder = sourceFile.parent?.path || '';
    const exportPath = folder ? `${folder}/${defaultName}` : defaultName;
    await this.app.vault.adapter.write(exportPath, content);
    new Notice(`已导出: ${exportPath}`);
  }

  saveExportBlob(blob: Blob, defaultName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
    new Notice(`已导出: ${defaultName}`);
  }
}
