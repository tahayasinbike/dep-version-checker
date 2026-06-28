import * as path from 'path';
import * as vscode from 'vscode';
import { Dependency, ManifestGroup, UpdateType } from '../core/types';
import { DepService, depId } from '../core/service';

const ICONS: Record<UpdateType, string> = {
  major: 'arrow-up',
  minor: 'arrow-up',
  patch: 'arrow-small-up',
  none: 'check',
  unknown: 'question',
};

const COLORS: Record<UpdateType, string | undefined> = {
  major: 'charts.red',
  minor: 'charts.yellow',
  patch: 'charts.blue',
  none: 'charts.green',
  unknown: 'disabledForeground',
};

const LABELS: Record<UpdateType, string> = {
  major: 'major',
  minor: 'minor',
  patch: 'patch',
  none: 'güncel',
  unknown: '?',
};

export class GroupItem extends vscode.TreeItem {
  constructor(public readonly group: ManifestGroup) {
    super(
      `${group.ecosystemLabel} · ${vscode.workspace.asRelativePath(group.manifestPath)}`,
      vscode.TreeItemCollapsibleState.Expanded
    );
    const outdated = group.dependencies.filter(
      (d) => d.updateType !== 'none' && d.updateType !== 'unknown'
    ).length;
    this.description = outdated > 0 ? `${outdated} güncelleme` : 'güncel';
    this.iconPath = new vscode.ThemeIcon('package');
    this.contextValue = 'manifestGroup';
    this.resourceUri = vscode.Uri.file(group.manifestPath);
    this.id = group.manifestPath;
  }
}

export class DepItem extends vscode.TreeItem {
  constructor(public readonly dep: Dependency) {
    super(dep.name, vscode.TreeItemCollapsibleState.None);
    const outdated = dep.updateType !== 'none' && dep.updateType !== 'unknown';
    this.id = depId(dep);
    if (dep.error) {
      this.description = `${dep.current ?? '?'} · ${dep.error}`;
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('disabledForeground'));
    } else if (outdated) {
      this.description = `${dep.current} → ${dep.latest}  (${LABELS[dep.updateType]})`;
    } else {
      this.description = `${dep.current}  (${LABELS[dep.updateType]})`;
    }
    if (!dep.error) {
      this.iconPath = new vscode.ThemeIcon(
        ICONS[dep.updateType],
        COLORS[dep.updateType] ? new vscode.ThemeColor(COLORS[dep.updateType]!) : undefined
      );
    }
    this.contextValue = outdated ? 'outdatedDependency' : 'dependency';
    this.tooltip = new vscode.MarkdownString(
      [
        `**${dep.name}**`,
        `Kurulu: \`${dep.current ?? '?'}\``,
        dep.latest ? `En son: \`${dep.latest}\`` : '',
        `Tür: ${LABELS[dep.updateType]}`,
        `Manifest: ${path.basename(dep.manifestPath)} (${dep.section})`,
      ]
        .filter(Boolean)
        .join('\n\n')
    );
    this.command = {
      command: 'depChecker.openInManifest',
      title: 'Aç',
      arguments: [this],
    };
  }
}

export class DepTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private readonly service: DepService) {
    service.onDidChange(() => this._onDidChange.fire());
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!element) {
      if (this.service.scanning && this.service.getGroups().length === 0) {
        const loading = new vscode.TreeItem('Taranıyor…');
        loading.iconPath = new vscode.ThemeIcon('loading~spin');
        return [loading];
      }
      return this.service.getGroups().map((g) => new GroupItem(g));
    }
    if (element instanceof GroupItem) {
      return element.group.dependencies.map((d) => new DepItem(d));
    }
    return [];
  }
}
