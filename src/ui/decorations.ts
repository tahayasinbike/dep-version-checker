import * as vscode from 'vscode';
import { DepService } from '../core/service';
import { providerForFile } from '../providers/provider';

const STATUS_FILE: Record<string, string> = {
  major: 'major.svg',
  minor: 'minor.svg',
  patch: 'patch.svg',
  none: 'none.svg',
};

export class DepDecorations {
  private readonly types: Record<string, vscode.TextEditorDecorationType> = {};
  private readonly disposables: vscode.Disposable[] = [];
  private editTimer: NodeJS.Timeout | undefined;

  constructor(extensionUri: vscode.Uri, private readonly service: DepService) {
    for (const [status, file] of Object.entries(STATUS_FILE)) {
      const type = vscode.window.createTextEditorDecorationType({
        gutterIconPath: vscode.Uri.joinPath(extensionUri, 'resources', 'gutter', file),
        gutterIconSize: 'contain',
      });
      this.types[status] = type;
      this.disposables.push(type);
    }
    this.disposables.push(
      service.onDidChange(() => this.refreshAll()),
      vscode.window.onDidChangeActiveTextEditor(() => this.refreshAll()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.refreshAll()),
      vscode.workspace.onDidChangeTextDocument((e) => {
        const active = vscode.window.activeTextEditor;
        if (!active || e.document !== active.document) return;
        if (this.editTimer) clearTimeout(this.editTimer);
        this.editTimer = setTimeout(() => this.apply(active), 250);
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
    const provider = providerForFile(doc.uri.fsPath);
    const group = provider && this.service.getGroups().find((g) => g.manifestPath === doc.uri.fsPath);
    const buckets: Record<string, vscode.Range[]> = { major: [], minor: [], patch: [], none: [] };
    if (group) {
      for (const dep of group.dependencies) {
        if (dep.error || dep.updateType === 'unknown') continue;
        if (dep.line < 0 || dep.line >= doc.lineCount) continue;
        buckets[dep.updateType]?.push(new vscode.Range(dep.line, 0, dep.line, 0));
      }
    }
    for (const status of Object.keys(this.types)) {
      editor.setDecorations(this.types[status], buckets[status] ?? []);
    }
  }
}
