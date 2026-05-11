import { PluginSettingTab, Setting, App, Plugin } from 'obsidian';

export interface MindDocSettings {
  defaultView: 'outline' | 'mindmap';
  defaultHeadingDepth: number;
  mindmapDirection: 'side' | 'right' | 'left';
  autoSaveDelay: number;
  enableVirtualScroll: boolean;
  virtualScrollThreshold: number;
  outlineFontSize: number;
  showNotePreview: boolean;
  embedDefaultHeight: number;
  indentSize: number;
}

export const DEFAULT_SETTINGS: MindDocSettings = {
  defaultView: 'outline',
  defaultHeadingDepth: 3,
  mindmapDirection: 'side',
  autoSaveDelay: 300,
  enableVirtualScroll: true,
  virtualScrollThreshold: 200,
  outlineFontSize: 14,
  showNotePreview: true,
  embedDefaultHeight: 400,
  indentSize: 24,
};

export class MindDocSettingTab extends PluginSettingTab {
  plugin: Plugin & { settings: MindDocSettings; saveSettings: () => Promise<void> };

  constructor(app: App, plugin: Plugin & { settings: MindDocSettings; saveSettings: () => Promise<void> }) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'MindDoc 设置' });

    new Setting(containerEl)
      .setName('默认视图')
      .setDesc('打开 MindDoc 文件时的默认视图')
      .addDropdown((drop) => {
        drop.addOption('outline', '大纲');
        drop.addOption('mindmap', '思维导图');
        drop.setValue(this.plugin.settings.defaultView);
        drop.onChange(async (value) => {
          this.plugin.settings.defaultView = value as 'outline' | 'mindmap';
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('自动保存延迟')
      .setDesc('编辑后等待多少毫秒再写入文件（100-5000）')
      .addText((text) => {
        text.setValue(String(this.plugin.settings.autoSaveDelay));
        text.onChange(async (value) => {
          const num = parseInt(value, 10);
          if (num >= 100 && num <= 5000) {
            this.plugin.settings.autoSaveDelay = num;
            await this.plugin.saveSettings();
          }
        });
      });
  }
}
