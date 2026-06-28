import * as vscode from 'vscode';
import { DepService, depId } from '../core/service';
import { providerForFile } from '../providers/provider';

const TYPE_LABEL: Record<string, string> = {
  major: 'major',
  minor: 'minor',
  patch: 'patch',
};

export class DepCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  constructor(private readonly service: DepService) {
    service.onDidChange(() => this._onDidChange.fire());
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!providerForFile(document.uri.fsPath)) return [];
    const group = this.service
      .getGroups()
      .find((g) => g.manifestPath === document.uri.fsPath);
    if (!group) return [];

    const lenses: vscode.CodeLens[] = [];
    for (const dep of group.dependencies) {
      if (dep.line < 0 || dep.line >= document.lineCount) continue;
      const outdated = dep.updateType !== 'none' && dep.updateType !== 'unknown';
      if (!outdated || !dep.latest) continue;
      const range = document.lineAt(dep.line).range;
      const id = depId(dep);
      if (dep.pinned) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: `📌 sabit (kaldır)`,
            command: 'depChecker.togglePin',
            arguments: [{ id }],
          })
        );
        continue;
      }
      lenses.push(
        new vscode.CodeLens(range, {
          title: `↑ ${dep.latest} (${TYPE_LABEL[dep.updateType] ?? dep.updateType})`,
          command: 'depChecker.updateDependency',
          arguments: [{ id, version: dep.latest }],
        })
      );
      if (dep.upgradeable.length > 1) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: 'sürüm seç…',
            command: 'depChecker.updateToVersion',
            arguments: [{ id }],
          })
        );
      }
      lenses.push(
        new vscode.CodeLens(range, {
          title: '📌 sabitle',
          command: 'depChecker.togglePin',
          arguments: [{ id }],
        })
      );
    }
    return lenses;
  }
}
