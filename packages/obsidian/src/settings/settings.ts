import { PluginSettingTab, Setting, App, Plugin } from 'obsidian';

export interface MindCtxSettings {
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

export const DEFAULT_SETTINGS: MindCtxSettings = {
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

export class MindCtxSettingTab extends PluginSettingTab {
  plugin: Plugin & { settings: MindCtxSettings; saveSettings: () => Promise<void> };

  constructor(app: App, plugin: Plugin & { settings: MindCtxSettings; saveSettings: () => Promise<void> }) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName('设置').setHeading();

    new Setting(containerEl)
      .setName('默认视图')
      .setDesc('打开 mindctx 文件时的默认视图')
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
      .setName('默认标题深度')
      .setDesc('标题最大层级（超过后转为列表项），1-6')
      .addSlider((slider) => {
        slider.setLimits(1, 6, 1);
        slider.setValue(this.plugin.settings.defaultHeadingDepth);
        slider.setDynamicTooltip();
        slider.onChange(async (value) => {
          this.plugin.settings.defaultHeadingDepth = value;
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

    new Setting(containerEl)
      .setName('大纲字体大小')
      .setDesc('大纲视图的字体大小（px）')
      .addSlider((slider) => {
        slider.setLimits(12, 20, 1);
        slider.setValue(this.plugin.settings.outlineFontSize);
        slider.setDynamicTooltip();
        slider.onChange(async (value) => {
          this.plugin.settings.outlineFontSize = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('显示备注预览')
      .setDesc('在大纲节点旁显示 note 的首行预览')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showNotePreview);
        toggle.onChange(async (value) => {
          this.plugin.settings.showNotePreview = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('脑图方向')
      .setDesc('思维导图的展开方向')
      .addDropdown((drop) => {
        drop.addOption('side', '左右展开');
        drop.addOption('right', '仅向右');
        drop.addOption('left', '仅向左');
        drop.setValue(this.plugin.settings.mindmapDirection);
        drop.onChange(async (value) => {
          this.plugin.settings.mindmapDirection = value as 'side' | 'right' | 'left';
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('虚拟滚动')
      .setDesc('节点数超过阈值时自动启用虚拟滚动以提升性能')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enableVirtualScroll);
        toggle.onChange(async (value) => {
          this.plugin.settings.enableVirtualScroll = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('虚拟滚动阈值')
      .setDesc('可见节点数超过此值时启用虚拟滚动（50-1000）')
      .addText((text) => {
        text.setValue(String(this.plugin.settings.virtualScrollThreshold));
        text.onChange(async (value) => {
          const num = parseInt(value, 10);
          if (num >= 50 && num <= 1000) {
            this.plugin.settings.virtualScrollThreshold = num;
            await this.plugin.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName('嵌入块默认高度')
      .setDesc('嵌入块的默认显示高度（px，200-1000）')
      .addText((text) => {
        text.setValue(String(this.plugin.settings.embedDefaultHeight));
        text.onChange(async (value) => {
          const num = parseInt(value, 10);
          if (num >= 200 && num <= 1000) {
            this.plugin.settings.embedDefaultHeight = num;
            await this.plugin.saveSettings();
          }
        });
      });
  }
}
