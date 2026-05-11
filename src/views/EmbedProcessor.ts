import { h } from 'preact';
import { render } from 'preact';
import { TFile } from 'obsidian';
import { parse } from '../core/parser.js';
import { EmbedView } from './EmbedView.js';
import type MindDocPlugin from '../main.js';

export interface EmbedConfig {
  file: string;
  mode: 'outline' | 'mindmap' | 'switchable';
  height: number;
  default: 'outline' | 'mindmap';
  maxDepth: number;
  collapsed: boolean;
}

export function parseEmbedConfig(source: string): EmbedConfig | { error: string } {
  const config: Partial<EmbedConfig> = {};
  const lines = source.trim().split('\n');

  for (const line of lines) {
    const match = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (!match) continue;
    const [, key, value] = match;

    switch (key) {
      case 'file': {
        const linkMatch = value.match(/\[\[(.+?)\]\]/);
        config.file = linkMatch ? linkMatch[1] : value.trim();
        break;
      }
      case 'mode':
        if (['outline', 'mindmap', 'switchable'].includes(value.trim())) {
          config.mode = value.trim() as EmbedConfig['mode'];
        }
        break;
      case 'height':
        config.height = parseInt(value.trim(), 10) || 400;
        break;
      case 'default':
        if (['outline', 'mindmap'].includes(value.trim())) {
          config.default = value.trim() as 'outline' | 'mindmap';
        }
        break;
      case 'maxDepth':
        config.maxDepth = parseInt(value.trim(), 10) || Infinity;
        break;
      case 'collapsed':
        config.collapsed = value.trim() === 'true';
        break;
    }
  }

  if (!config.file) {
    return { error: '缺少 file 参数，请指定要嵌入的 .mind.md 文件' };
  }

  return {
    file: config.file,
    mode: config.mode ?? 'switchable',
    height: config.height ?? 400,
    default: config.default ?? 'outline',
    maxDepth: config.maxDepth ?? Infinity,
    collapsed: config.collapsed ?? false,
  };
}

export function registerEmbedProcessor(plugin: MindDocPlugin) {
  plugin.registerMarkdownCodeBlockProcessor('minddoc', async (source, el, ctx) => {
    const config = parseEmbedConfig(source);

    if ('error' in config) {
      renderError(el, config.error);
      return;
    }

    const file = plugin.app.metadataCache.getFirstLinkpathDest(config.file, ctx.sourcePath);

    if (!file) {
      renderFileNotFound(el, config.file, plugin);
      return;
    }

    try {
      const content = await plugin.app.vault.read(file);
      const tree = parse(content, { filePath: file.path });

      render(
        h(EmbedView, { tree, config, file, plugin }),
        el
      );
    } catch (e: any) {
      renderError(el, `解析错误: ${e.message}`);
    }
  });
}

function renderError(el: HTMLElement, message: string) {
  const div = el.createDiv({ cls: 'minddoc-embed-error' });
  div.createSpan({ text: '⚠️ MindDoc: ' + message });
}

function renderFileNotFound(el: HTMLElement, fileName: string, plugin: MindDocPlugin) {
  const div = el.createDiv({ cls: 'minddoc-embed-error' });
  div.createSpan({ text: `文件未找到: ${fileName}` });
  const btn = div.createEl('button', { text: '创建文件' });
  btn.addEventListener('click', async () => {
    const content = `---\nminddoc: true\n---\n\n# ${fileName.replace(/\.mind\.md$/, '').replace(/\.md$/, '')}\n`;
    await plugin.app.vault.create(fileName.endsWith('.md') ? fileName : fileName + '.mind.md', content);
  });
}
