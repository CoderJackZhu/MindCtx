import * as vscode from 'vscode';
import { MindCtxEditorProvider } from './MindCtxEditorProvider.js';
import { parse, exportOPML, exportJSON, copyAsAIContext } from '@mindctx/core';

let provider: MindCtxEditorProvider;

export function activate(context: vscode.ExtensionContext): void {
  const registration = MindCtxEditorProvider.register(context);
  provider = registration.provider;
  context.subscriptions.push(registration.disposable);

  context.subscriptions.push(
    vscode.commands.registerCommand('mindctx.create', createNewFile),
    vscode.commands.registerCommand('mindctx.openAs', openWithMindCtx),
    vscode.commands.registerCommand('mindctx.import.opml', () => importFile('opml')),
    vscode.commands.registerCommand('mindctx.import.freemind', () => importFile('freemind')),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mindctx.export.opml', () => exportFromEditor('opml')),
    vscode.commands.registerCommand('mindctx.export.json', () => exportFromEditor('json')),
    vscode.commands.registerCommand('mindctx.export.png', () => exportPngFromEditor()),
    vscode.commands.registerCommand('mindctx.copyAIContext', copyAIContextFromEditor),
    vscode.commands.registerCommand('mindctx.toggleView', () => sendWebviewCommand('toggleView')),
    vscode.commands.registerCommand('mindctx.expandAll', () => sendWebviewCommand('expandAll')),
    vscode.commands.registerCommand('mindctx.collapseAll', () => sendWebviewCommand('collapseAll')),
  );
}

export function deactivate(): void {}

async function createNewFile(): Promise<void> {
  const uri = await vscode.window.showSaveDialog({
    filters: { 'MindCtx': ['mind.md'] },
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
  });
  if (!uri) return;

  const template = `---\nmindctx: true\nheading-depth: 4\n---\n\n# New Document\n\n## Section 1\n\n- Item 1\n- Item 2\n`;
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(template));
  await vscode.commands.executeCommand('vscode.openWith', uri, 'mindctx.editor');
}

async function openWithMindCtx(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  await vscode.commands.executeCommand('vscode.openWith', editor.document.uri, 'mindctx.editor');
}

async function importFile(format: 'opml' | 'freemind'): Promise<void> {
  const { importOPML, importFreeMind } = await import('@mindctx/core');

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
    filters: { 'MindCtx': ['mind.md'] },
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
  });
  if (!destUri) return;

  await vscode.workspace.fs.writeFile(destUri, new TextEncoder().encode(markdown));
  await vscode.commands.executeCommand('vscode.openWith', destUri, 'mindctx.editor');
  vscode.window.showInformationMessage(`Imported ${fileName} successfully.`);
}

async function exportFromEditor(format: 'opml' | 'json'): Promise<void> {
  const doc = provider.getActiveDocument();
  if (!doc) {
    vscode.window.showWarningMessage('No active MindCtx editor.');
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
    vscode.window.showWarningMessage('No active MindCtx editor.');
    return;
  }
  provider.sendCommandToActivePanel(doc, 'export.png');
}

async function copyAIContextFromEditor(uri?: vscode.Uri): Promise<void> {
  if (uri) {
    const data = await vscode.workspace.fs.readFile(uri);
    const content = new TextDecoder().decode(data);
    const tree = parse(content, { filePath: uri.fsPath });
    const text = copyAsAIContext(tree);
    await vscode.env.clipboard.writeText(text);
    vscode.window.showInformationMessage('AI context copied to clipboard.');
    return;
  }

  const doc = provider.getActiveDocument();
  if (!doc) {
    vscode.window.showWarningMessage('No active MindCtx editor.');
    return;
  }

  const text = copyAsAIContext(doc.tree);
  await vscode.env.clipboard.writeText(text);
  vscode.window.showInformationMessage('AI context copied to clipboard.');
}

function sendWebviewCommand(name: 'toggleView' | 'expandAll' | 'collapseAll'): void {
  const doc = provider.getActiveDocument();
  if (!doc) return;
  provider.sendCommandToActivePanel(doc, name);
}
