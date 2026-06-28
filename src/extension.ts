import * as vscode from 'vscode';
import { DepService } from './core/service';
import { Dependency } from './core/types';
import { classifyUpdate } from './core/semver';
import { registerProvider } from './providers/provider';
import { npmProvider } from './providers/npm';
import { pipProvider } from './providers/pip';
import { cargoProvider } from './providers/cargo';
import { composerProvider } from './providers/composer';
import { DepTreeProvider, DepItem } from './ui/treeView';
import { DepCodeLensProvider } from './ui/codeLens';

function argDep(arg: any): Dependency | undefined {
  if (arg instanceof DepItem) return arg.dep;
  return undefined;
}

export function activate(context: vscode.ExtensionContext) {
  registerProvider(npmProvider);
  registerProvider(pipProvider);
  registerProvider(cargoProvider);
  registerProvider(composerProvider);

  const service = new DepService();
  const tree = new DepTreeProvider(service);
  const codeLens = new DepCodeLensProvider(service);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('depCheckerView', tree),
    vscode.languages.registerCodeLensProvider(
      [
        { scheme: 'file', pattern: '**/package.json' },
        { scheme: 'file', pattern: '**/composer.json' },
        { scheme: 'file', pattern: '**/Cargo.toml' },
        { scheme: 'file', pattern: '**/pyproject.toml' },
        { scheme: 'file', pattern: '**/requirements*.txt' },
      ],
      codeLens
    )
  );

  const refresh = () =>
    vscode.window.withProgress(
      { location: { viewId: 'depCheckerView' }, title: 'Bağımlılıklar taranıyor' },
      () => service.scan()
    );

  context.subscriptions.push(
    vscode.commands.registerCommand('depChecker.refresh', refresh),

    vscode.commands.registerCommand('depChecker.openInManifest', async (arg) => {
      const dep = argDep(arg);
      if (!dep) return;
      const doc = await vscode.workspace.openTextDocument(dep.manifestPath);
      const editor = await vscode.window.showTextDocument(doc);
      if (dep.line >= 0 && dep.line < doc.lineCount) {
        const pos = new vscode.Position(dep.line, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(doc.lineAt(dep.line).range, vscode.TextEditorRevealType.InCenter);
      }
    }),

    vscode.commands.registerCommand('depChecker.updateDependency', async (arg) => {
      const id = arg instanceof DepItem ? arg.id : arg?.id;
      if (!id) return;
      const found = service.findDependency(id);
      if (!found?.dep.latest) return;
      const version = arg?.version ?? found.dep.latest;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `${found.dep.name} → ${version}` },
        () => service.updateDependency(id, version)
      );
    }),

    vscode.commands.registerCommand('depChecker.updateToVersion', async (arg) => {
      const id = arg instanceof DepItem ? arg.id : arg?.id;
      if (!id) return;
      const found = service.findDependency(id);
      if (!found) return;
      const { dep } = found;
      if (dep.upgradeable.length === 0) {
        vscode.window.showInformationMessage(`${dep.name} zaten güncel.`);
        return;
      }
      const items = [...dep.upgradeable].reverse().map((v) => ({
        label: v,
        description: dep.current ? classifyUpdate(dep.current, v) : '',
      }));
      const picked = await vscode.window.showQuickPick(items, {
        title: `${dep.name} — geçilecek sürüm (kurulu: ${dep.current})`,
        placeHolder: 'Bir sürüm seçin',
      });
      if (!picked) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `${dep.name} → ${picked.label}` },
        () => service.updateDependency(id, picked.label)
      );
    }),

    vscode.commands.registerCommand('depChecker.updateAll', async () => {
      const count = service
        .getGroups()
        .reduce(
          (n, g) =>
            n + g.dependencies.filter((d) => d.updateType !== 'none' && d.updateType !== 'unknown').length,
          0
        );
      if (count === 0) {
        vscode.window.showInformationMessage('Güncellenecek bağımlılık yok.');
        return;
      }
      const ok = await vscode.window.showWarningMessage(
        `${count} bağımlılık en son sürümlerine güncellenecek. Devam edilsin mi?`,
        { modal: true },
        'Güncelle'
      );
      if (ok !== 'Güncelle') return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Tümü güncelleniyor' },
        async () => {
          const updated = await service.updateAll();
          vscode.window.showInformationMessage(`${updated} bağımlılık güncellendi.`);
        }
      );
    })
  );

  let timer: NodeJS.Timeout | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (/(package|composer)\.json$|Cargo\.toml$|pyproject\.toml$|requirements.*\.txt$/.test(doc.fileName)) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(refresh, 600);
      }
    })
  );

  refresh();
}

export function deactivate() {}
