import * as vscode from 'vscode';
import { DepService } from '../core/service';
import { providerForFile } from '../providers/provider';

const STATUS: Record<string, string> = {
  major: '❗',
  minor: '🟢',
  patch: '🔵',
  none: '✅',
};

export class DepDecorations {
  private readonly type: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly service: DepService) {
    this.type = vscode.window.createTextEditorDecorationType({
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    this.disposables.push(
      this.type,
      service.onDidChange(() => this.refreshAll()),
      vscode.window.onDidChangeActiveTextEditor(() => this.refreshAll()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.refreshAll()),
      vscode.workspace.onDidChangeTextDocument((e) => {
        const active = vscode.window.activeTextEditor;
        if (active && e.document === active.document) this.refreshAll();
      })
    );
    this.refreshAll();
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }

  private refreshAll(): void {
    for (const editor of vscode.window.visibleTextEditors) this.apply(editor);
  }

  private apply(editor: vscode.TextEditor): void {
    const doc = editor.document;
    if (!providerForFile(doc.uri.fsPath)) {
      editor.setDecorations(this.type, []);
      return;
    }
    const group = this.service.getGroups().find((g) => g.manifestPath === doc.uri.fsPath);
    if (!group) {
      editor.setDecorations(this.type, []);
      return;
    }
    const opts: vscode.DecorationOptions[] = [];
    for (const dep of group.dependencies) {
      if (dep.error || dep.updateType === 'unknown') continue;
      if (dep.line < 0 || dep.line >= doc.lineCount) continue;
      const symbol = STATUS[dep.updateType];
      if (!symbol) continue;
      const len = doc.lineAt(dep.line).text.length;
      const range = new vscode.Range(dep.line, len, dep.line, len);
      opts.push({
        range,
        renderOptions: {
          after: {
            contentText: ' ' + symbol,
            textDecoration: 'none; font-size: 1.6em; vertical-align: -18%',
          },
        },
      });
    }
    editor.setDecorations(this.type, opts);
  }
}
