import * as vscode from 'vscode';
import { DepService, depId } from '../core/service';
import { providerForFile } from '../providers/provider';

const REGISTRY_LABEL: Record<string, string> = {
  npm: '↗ npm',
  pip: '↗ PyPI',
  cargo: '↗ crates.io',
  composer: '↗ Packagist',
};

export class DepCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  constructor(private readonly service: DepService) {
    service.onDidChange(() => this._onDidChange.fire());
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const provider = providerForFile(document.uri.fsPath);
    if (!provider) return [];
    const group = this.service.getGroups().find((g) => g.manifestPath === document.uri.fsPath);
    if (!group) return [];

    const lenses: vscode.CodeLens[] = [];
    for (const dep of group.dependencies) {
      if (dep.line < 0 || dep.line >= document.lineCount) continue;
      if (dep.error || dep.updateType === 'unknown') continue;
      const range = document.lineAt(dep.line).range;
      const id = depId(dep);
      const registryLens = new vscode.CodeLens(range, {
        title: REGISTRY_LABEL[provider.id] ?? '↗ page',
        command: 'depChecker.openHomepage',
        arguments: [{ id }],
      });

      if (dep.updateType === 'none') {
        lenses.push(new vscode.CodeLens(range, { title: 'up to date', command: '' }), registryLens);
        continue;
      }

      if (dep.pinned) {
        const noteTitle = dep.pinNote
          ? `📝 ${dep.pinNote.length > 32 ? dep.pinNote.slice(0, 32) + '…' : dep.pinNote}`
          : '📝 add note';
        lenses.push(
          new vscode.CodeLens(range, {
            title: '📌 pinned (unpin)',
            command: 'depChecker.togglePin',
            arguments: [{ id }],
          }),
          new vscode.CodeLens(range, {
            title: noteTitle,
            command: 'depChecker.editPinNote',
            arguments: [{ id }],
          }),
          registryLens
        );
        continue;
      }

      lenses.push(
        new vscode.CodeLens(range, {
          title: `↑ ${dep.latest} (${dep.updateType})`,
          command: 'depChecker.updateDependency',
          arguments: [{ id, version: dep.latest }],
        })
      );
      if (dep.upgradeable.length > 1) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: 'pick version…',
            command: 'depChecker.updateToVersion',
            arguments: [{ id }],
          })
        );
      }
      lenses.push(
        new vscode.CodeLens(range, {
          title: '📌 pin',
          command: 'depChecker.togglePin',
          arguments: [{ id }],
        }),
        registryLens
      );
    }
    return lenses;
  }
}
