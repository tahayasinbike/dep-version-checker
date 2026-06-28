import * as vscode from 'vscode';
import { DepService, depId } from './core/service';
import { PinStore } from './core/pinStore';
import { Dependency } from './core/types';
import { classifyUpdate, compareVersions } from './core/semver';
import { registerProvider } from './providers/provider';
import { npmProvider } from './providers/npm';
import { pipProvider } from './providers/pip';
import { cargoProvider } from './providers/cargo';
import { composerProvider } from './providers/composer';
import { DepWebviewProvider } from './ui/webview';
import { DepCodeLensProvider } from './ui/codeLens';

function argDep(arg: any): Dependency | undefined {
  return arg?.dep;
}

export function activate(context: vscode.ExtensionContext) {
  registerProvider(npmProvider);
  registerProvider(pipProvider);
  registerProvider(cargoProvider);
  registerProvider(composerProvider);

  const folder = vscode.workspace.workspaceFolders?.[0];
  const pinsFile = folder
    ? vscode.Uri.joinPath(folder.uri, '.vscode', 'dep-version-checker.json').fsPath
    : undefined;
  const pinStore = new PinStore(pinsFile);
  const service = new DepService(pinStore);
  const webview = new DepWebviewProvider(context.extensionUri, service);
  const codeLens = new DepCodeLensProvider(service);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('depCheckerView', webview),
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

  const applyUpdates = async (items: { id: string; version: string }[]) => {
    if (!items.length) return;
    let finalItems = items;
    const conflicts = await service.findConflicts(items);
    if (conflicts.length) {
      const fixMap = new Map<string, string>();
      for (const c of conflicts) {
        if (!c.fix) continue;
        const prev = fixMap.get(c.fix.id);
        if (!prev || compareVersions(c.fix.version, prev) > 0) fixMap.set(c.fix.id, c.fix.version);
      }
      const fixes = [...fixMap].map(([id, version]) => ({ id, version }));
      const lines = conflicts
        .slice(0, 10)
        .map((c) => `• ${c.source}@${c.sourceVersion} → ${c.peer} "${c.requiredRange}" gerekiyor (mevcut ${c.peer}@${c.actual})`);
      const more = conflicts.length > 10 ? `\n… ve ${conflicts.length - 10} tane daha` : '';
      const detail = fixes.length
        ? `Otomatik düzelt: ${fixes.map((f) => f.id.split('::').pop() + '@' + f.version).join(', ')} de uyumlu sürüme çekilecek.`
        : 'Kurulumda çakışma sürerse ayarlardan npmPeerConflictStrategy = legacy-peer-deps deneyebilirsiniz.';
      const buttons = fixes.length ? ['Otomatik düzelt & güncelle', 'Yine de güncelle'] : ['Yine de güncelle'];
      const choice = await vscode.window.showWarningMessage(
        `Peer dependency uyuşmazlığı bulundu:\n\n${lines.join('\n')}${more}`,
        { modal: true, detail },
        ...buttons
      );
      if (!choice) return;
      if (choice.startsWith('Otomatik')) {
        const merged = new Map(items.map((i) => [i.id, i.version]));
        for (const f of fixes) if (!merged.has(f.id)) merged.set(f.id, f.version);
        finalItems = [...merged].map(([id, version]) => ({ id, version }));
      }
    }
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `${finalItems.length} paket güncelleniyor` },
      async () => {
        const n = await service.updateMany(finalItems);
        vscode.window.showInformationMessage(`${n} bağımlılık güncellendi.`);
      }
    );
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('depChecker.refresh', refresh),

    vscode.commands.registerCommand('depChecker.applyUpdates', (items) =>
      applyUpdates(Array.isArray(items) ? items : [])
    ),

    vscode.commands.registerCommand('depChecker.togglePin', async (arg) => {
      const id = arg?.id;
      if (id) await service.togglePin(id);
    }),

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
      const id = arg?.id;
      if (!id) return;
      const found = service.findDependency(id);
      if (!found?.dep.latest) return;
      const version = arg?.version ?? found.dep.latest;
      await applyUpdates([{ id, version }]);
    }),

    vscode.commands.registerCommand('depChecker.updateToVersion', async (arg) => {
      const id = arg?.id;
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
      await applyUpdates([{ id, version: picked.label }]);
    }),

    vscode.commands.registerCommand('depChecker.updateAll', async () => {
      const count = service
        .getGroups()
        .reduce(
          (n, g) =>
            n +
            g.dependencies.filter(
              (d) => d.updateType !== 'none' && d.updateType !== 'unknown' && !service.isPinned(depId(d))
            ).length,
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
      const items: { id: string; version: string }[] = [];
      for (const g of service.getGroups()) {
        for (const d of g.dependencies) {
          if (d.latest && d.updateType !== 'none' && d.updateType !== 'unknown' && !service.isPinned(depId(d))) {
            items.push({ id: depId(d), version: d.latest });
          }
        }
      }
      await applyUpdates(items);
    })
  );

  let timer: NodeJS.Timeout | undefined;
  const debouncedRefresh = (delay: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(refresh, delay);
  };

  const lockWatcher = vscode.workspace.createFileSystemWatcher(
    '**/{package-lock.json,pnpm-lock.yaml,yarn.lock,bun.lockb,bun.lock,Cargo.lock,composer.lock}'
  );
  lockWatcher.onDidChange(() => debouncedRefresh(800));
  lockWatcher.onDidCreate(() => debouncedRefresh(800));

  const pinsWatcher = vscode.workspace.createFileSystemWatcher('**/.vscode/dep-version-checker.json');
  pinsWatcher.onDidChange(() => service.reloadPins());
  pinsWatcher.onDidCreate(() => service.reloadPins());
  pinsWatcher.onDidDelete(() => service.reloadPins());

  context.subscriptions.push(
    lockWatcher,
    pinsWatcher,
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (/(package|composer)\.json$|Cargo\.toml$|pyproject\.toml$|requirements.*\.txt$/.test(doc.fileName)) {
        debouncedRefresh(600);
      }
    })
  );

  refresh();
}

export function deactivate() {}
