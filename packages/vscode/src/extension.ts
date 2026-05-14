import * as vscode from 'vscode';
import { MindDocEditorProvider } from './MindDocEditorProvider.js';
import { exportOPML, exportJSON, copyAsAIContext } from '@minddoc/core';

export function activate(context: vscode.ExtensionContext): void {
  // Register custom editor provider
  context.subscriptions.push(MindDocEditorProvider.register(context));

  // Commands that DON'T need an active editor
  context.subscriptions.push(
    vscode.commands.registerCommand('minddoc.create', createNewFile),
    vscode.commands.registerCommand('minddoc.openAs', openWithMindDoc),
    vscode.commands.registerCommand('minddoc.import.opml', () => importFile('opml')),
    vscode.commands.registerCommand('minddoc.import.freemind', () => importFile('freemind')),
  );

  // Commands that NEED an active MindDoc editor — these are dispatched to the webview
  // via the provider (toggleView, expandAll, collapseAll, export.png are webview commands)
  // export.opml, export.json, copyAIContext can be done directly from extension host
  context.subscriptions.push(
    vscode.commands.registerCommand('minddoc.export.opml', () => exportFromEditor('opml')),
    vscode.commands.registerCommand('minddoc.export.json', () => exportFromEditor('json')),
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

  const filters = format === 'opml'
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
  // Get the active document's tree from the provider
  // Since we can't easily access the provider's document here,
  // we'll need to get it through the active custom editor
  // For now, this requires the MindDocEditorProvider to expose the active document
  vscode.window.showWarningMessage('Export not yet connected to editor. Coming in Phase 4.');
}

async function copyAIContextFromEditor(): Promise<void> {
  vscode.window.showWarningMessage('Copy AI Context not yet connected to editor. Coming in Phase 4.');
}
