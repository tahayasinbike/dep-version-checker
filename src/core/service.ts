import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Dependency, ManifestGroup, VersionInfo } from './types';
import { classifyUpdate, pickLatest, upgradeableVersions } from './semver';
import {
  EcosystemProvider,
  allProviders,
  manifestGlobs,
  providerForFile,
} from '../providers/provider';

const EXCLUDE = '{**/node_modules/**,**/vendor/**,**/.git/**,**/dist/**,**/build/**,**/target/**,**/.venv/**}';

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function config() {
  return vscode.workspace.getConfiguration('depChecker');
}

export function depId(d: Dependency): string {
  return `${d.manifestPath}::${d.section}::${d.name}`;
}

export class DepService {
  private groups: ManifestGroup[] = [];
  private versionCache = new Map<string, VersionInfo | undefined>();
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;
  scanning = false;

  getGroups(): ManifestGroup[] {
    return this.groups;
  }

  findDependency(id: string): { dep: Dependency; provider: EcosystemProvider } | undefined {
    for (const g of this.groups) {
      for (const d of g.dependencies) {
        if (depId(d) === id) {
          const provider = providerForFile(d.manifestPath);
          if (provider) return { dep: d, provider };
        }
      }
    }
    return undefined;
  }

  async scan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    this._onDidChange.fire();
    try {
      const globs = manifestGlobs();
      const pattern = `{${globs.join(',')}}`;
      const uris = await vscode.workspace.findFiles(pattern, EXCLUDE, 200);
      const timeoutMs = config().get<number>('requestTimeoutMs', 8000);
      const includePre = config().get<boolean>('includePrerelease', false);
      const groups: ManifestGroup[] = [];

      for (const uri of uris) {
        const provider = providerForFile(uri.fsPath);
        if (!provider) continue;
        let content: string;
        try {
          content = fs.readFileSync(uri.fsPath, 'utf8');
        } catch {
          continue;
        }
        const parsed = await provider.parse(uri.fsPath, content, path.dirname(uri.fsPath));
        if (parsed.length === 0) continue;

        const deps = await mapLimit(parsed, 8, async (p): Promise<Dependency> => {
          const base: Dependency = {
            ...p,
            ecosystem: provider.id,
            manifestPath: uri.fsPath,
            updateType: 'unknown',
            upgradeable: [],
          };
          const current = p.current;
          if (!current) return base;
          try {
            const key = `${provider.id}:${p.name}`;
            let info = this.versionCache.get(key);
            if (info === undefined && !this.versionCache.has(key)) {
              info = await provider.fetchVersions(p.name, timeoutMs);
              this.versionCache.set(key, info);
            }
            if (!info) return { ...base, error: 'sürüm bulunamadı' };
            const latest = pickLatest(info.versions, includePre) ?? info.latest;
            return {
              ...base,
              latest,
              updateType: classifyUpdate(current, latest),
              upgradeable: upgradeableVersions(current, info.versions, includePre),
            };
          } catch (e: any) {
            return { ...base, error: e?.message ?? 'hata' };
          }
        });

        deps.sort((a, b) => {
          const rank = (t: string) => ({ major: 0, minor: 1, patch: 2 } as any)[t] ?? 3;
          const r = rank(a.updateType) - rank(b.updateType);
          return r !== 0 ? r : a.name.localeCompare(b.name);
        });

        groups.push({
          manifestPath: uri.fsPath,
          ecosystem: provider.id,
          ecosystemLabel: provider.label,
          dependencies: deps,
        });
      }

      groups.sort((a, b) => a.manifestPath.localeCompare(b.manifestPath));
      this.groups = groups;
    } finally {
      this.scanning = false;
      this._onDidChange.fire();
    }
  }

  async updateDependency(id: string, version: string): Promise<void> {
    const found = this.findDependency(id);
    if (!found) return;
    const { dep, provider } = found;
    this.writeManifest(dep.manifestPath, (content) => provider.rewrite(content, dep, version));
    this.runInstall(provider, dep.manifestPath);
    await this.scan();
  }

  async updateGroup(manifestPath: string): Promise<number> {
    const group = this.groups.find((g) => g.manifestPath === manifestPath);
    if (!group) return 0;
    const provider = providerForFile(manifestPath);
    if (!provider) return 0;
    const targets = group.dependencies.filter((d) => d.latest && d.updateType !== 'none' && d.updateType !== 'unknown');
    if (targets.length === 0) return 0;
    this.writeManifest(manifestPath, (content) => {
      let out = content;
      for (const d of targets) out = provider.rewrite(out, d, d.latest!);
      return out;
    });
    this.runInstall(provider, manifestPath);
    await this.scan();
    return targets.length;
  }

  async updateAll(): Promise<number> {
    let total = 0;
    for (const g of [...this.groups]) total += await this.updateGroup(g.manifestPath);
    return total;
  }

  private writeManifest(manifestPath: string, transform: (content: string) => string): void {
    const content = fs.readFileSync(manifestPath, 'utf8');
    fs.writeFileSync(manifestPath, transform(content), 'utf8');
  }

  private runInstall(provider: EcosystemProvider, manifestPath: string): void {
    if (!config().get<boolean>('runInstallAfterUpdate', true)) return;
    const cmd = provider.installCommand(manifestPath);
    if (!cmd) return;
    const cwd = path.dirname(manifestPath);
    const term =
      vscode.window.terminals.find((t) => t.name === 'Dep Checker') ??
      vscode.window.createTerminal({ name: 'Dep Checker', cwd });
    term.show(true);
    term.sendText(cmd);
  }
}
