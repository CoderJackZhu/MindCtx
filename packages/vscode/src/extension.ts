import * as vscode from 'vscode';
import { MindDocEditorProvider } from './MindDocEditorProvider.js';
import { exportOPML, exportJSON, copyAsAIContext } from '@minddoc/core';

let provider: MindDocEditorProvider;

export function activate(context: vscode.ExtensionContext): void {
  const registration = MindDocEditorProvider.register(context);
  provider = registration.provider;
  context.subscriptions.push(registration.disposable);

  context.subscriptions.push(
    vscode.commands.registerCommand('minddoc.create', createNewFile),
    vscode.commands.registerCommand('minddoc.openAs', openWithMindDoc),
    vscode.commands.registerCommand('minddoc.import.opml', () => importFile('opml')),
    vscode.commands.registerCommand('minddoc.import.freemind', () => importFile('freemind')),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('minddoc.export.opml', () => exportFromEditor('opml')),
    vscode.commands.registerCommand('minddoc.export.json', () => exportFromEditor('json')),
    vscode.commands.registerCommand('minddoc.export.png', () => exportPngFromEditor()),
    vscode.commands.registerCommand('minddoc.copyAIContext', copyAIContextFromEditor),
  );
}

export function deactivate(): void {}

async function createNewFile(): Promise<void> {
  const uri = await vscode.window.showSaveDialog({
    filters: { 'MindDoc': ['mind.md'] },
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
  });
  if (!uri) return;

  const template = `---\nminddoc: true\nheading-depth: 3\n---\n\n# New Document\n\n## Section 1\n\n- Item 1\n- Item 2\n`;
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(template));
  await vscode.commands.executeCommand('vscode.openWith', uri, 'minddoc.editor');
}

async function openWithMindDoc(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  await vscode.commands.executeCommand('vscode.openWith', editor.document.uri, 'minddoc.editor');
}

async function importFile(format: 'opml' | 'freemind'): Promise<void> {
  const { importOPML, importFreeMind } = await import('@minddoc/core');

  const filters: Record<string, string[]> = format === 'opml'
    ? { 'OPML': ['opml', 'xml'] }
    : { 'FreeMind': ['mm'] };

  const sourceUris = await vscode.window.showOpenDialog({ filters, canSelectMany: false });
  if (!sourceUris || sourceUris.length === 0) return;

  const fileData = await vscode.workspace.fs.readFile(sourceUris[0]);
  const text = new TextDecoder().decode(fileData);
  const fileName = sourceUris[0].path.split('/').pop() ?? 'import';

  let markdown: string;
  if (format === 'opml') {
    markdown = importOPML(text, fileName);
  } else {
    markdown = importFreeMind(text, fileName);
  }

  const destUri = await vscode.window.showSaveDialog({
    filters: { 'MindDoc': ['mind.md'] },
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
  });
  if (!destUri) return;

  await vscode.workspace.fs.writeFile(destUri, new TextEncoder().encode(markdown));
  await vscode.commands.executeCommand('vscode.openWith', destUri, 'minddoc.editor');
  vscode.window.showInformationMessage(`Imported ${fileName} successfully.`);
}

async function exportFromEditor(format: 'opml' | 'json'): Promise<void> {
  const doc = provider.getActiveDocument();
  if (!doc) {
    vscode.window.showWarningMessage('No active MindDoc editor.');
    return;
  }

  const tree = doc.tree;
  const content = format === 'opml' ? exportOPML(tree) : exportJSON(tree);
  const ext = format === 'opml' ? 'opml' : 'json';
  const filterLabel = format === 'opml' ? 'OPML' : 'JSON';

  const docName = doc.uri.path.split('/').pop()?.replace(/\.mind\.md$/, '') ?? 'mindmap';
  const defaultUri = vscode.Uri.joinPath(
    vscode.Uri.file(doc.uri.fsPath).with({ path: doc.uri.path.replace(/[^/]+$/, '') }),
    `${docName}.${ext}`
  );

  const saveUri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { [filterLabel]: [ext] },
  });
  if (!saveUri) return;

  await vscode.workspace.fs.writeFile(saveUri, new TextEncoder().encode(content));
  vscode.window.showInformationMessage(`Exported to ${saveUri.fsPath}`);
}

async function exportPngFromEditor(): Promise<void> {
  const doc = provider.getActiveDocument();
  if (!doc) {
    vscode.window.showWarningMessage('No active MindDoc editor.');
    return;
  }
  provider.sendCommandToActivePanel(doc, 'export.png');
}

async function copyAIContextFromEditor(): Promise<void> {
  const doc = provider.getActiveDocument();
  if (!doc) {
    vscode.window.showWarningMessage('No active MindDoc editor.');
    return;
  }

  const text = copyAsAIContext(doc.tree);
  await vscode.env.clipboard.writeText(text);
  vscode.window.showInformationMessage('AI context copied to clipboard.');
}
