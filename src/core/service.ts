import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Conflict, Dependency, ManifestGroup, VersionInfo } from './types';
import {
  classifyUpdate,
  cleanVersion,
  compareVersions,
  isPrerelease,
  pickLatest,
  satisfies,
  upgradeableVersions,
} from './semver';
import { PinStore } from './pinStore';
import { RawVuln, affectsVersion, queryPackage } from './vuln';
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
  return `${vscode.workspace.asRelativePath(d.manifestPath)}::${d.section}::${d.name}`;
}

export class DepService {
  private groups: ManifestGroup[] = [];
  private versionCache = new Map<string, VersionInfo | undefined>();
  private peerCache = new Map<string, Record<string, string>>();
  private vulnCache = new Map<string, RawVuln[]>();
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;
  scanning = false;

  constructor(private readonly pins: PinStore) {}

  getGroups(): ManifestGroup[] {
    return this.groups;
  }

  isPinned(id: string): boolean {
    return this.pins.has(id);
  }

  async togglePin(id: string): Promise<void> {
    const pinned = await this.pins.toggle(id);
    for (const g of this.groups) {
      const live = g.dependencies.find((d) => depId(d) === id);
      if (live) {
        live.pinned = pinned;
        live.pinNote = pinned ? this.pins.getNote(id) : undefined;
      }
    }
    this._onDidChange.fire();
  }

  async setPinNote(id: string, note: string): Promise<void> {
    await this.pins.setNote(id, note);
    for (const g of this.groups) {
      const live = g.dependencies.find((d) => depId(d) === id);
      if (live) live.pinNote = note || undefined;
    }
    this._onDidChange.fire();
  }

  reloadPins(): void {
    this.pins.reload();
    for (const g of this.groups) {
      for (const d of g.dependencies) {
        const id = depId(d);
        d.pinned = this.pins.has(id);
        d.pinNote = d.pinned ? this.pins.getNote(id) : undefined;
      }
    }
    this._onDidChange.fire();
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
            versions: [],
            deprecated: [],
            vulns: [],
            vulnVersions: {},
            pinned: this.pins.has(`${vscode.workspace.asRelativePath(uri.fsPath)}::${p.section}::${p.name}`),
            pinNote: this.pins.getNote(`${vscode.workspace.asRelativePath(uri.fsPath)}::${p.section}::${p.name}`),
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
            if (!info) return { ...base, error: 'version not found' };
            let latest = info.latest;
            if (!cleanVersion(latest)) latest = pickLatest(info.versions, includePre) ?? latest;
            const all = info.versions
              .filter((v) => cleanVersion(v))
              .filter((v) => includePre || !isPrerelease(v))
              .filter((v) => compareVersions(v, latest) <= 0)
              .sort(compareVersions);
            if (cleanVersion(current) && !all.includes(current)) {
              all.push(current);
              all.sort(compareVersions);
            }
            const versionsDesc = [...all].reverse();
            const deprecated = (info.deprecated ?? []).filter((v) => all.includes(v));
            let upgradeable = upgradeableVersions(current, info.versions, includePre);
            if (!includePre) {
              upgradeable = upgradeable.filter((v) => compareVersions(v, latest) <= 0);
            }
            let vulns: string[] = [];
            const vulnVersions: Record<string, string[]> = {};
            const raws = await this.packageVulns(provider.osvEcosystem, p.name, timeoutMs);
            if (raws.length) {
              vulns = raws.filter((r) => affectsVersion(current, r)).map((r) => r.id);
              for (const v of versionsDesc) {
                const ids = raws.filter((r) => affectsVersion(v, r)).map((r) => r.id);
                if (ids.length) vulnVersions[v] = ids;
              }
            }
            return {
              ...base,
              latest,
              updateType: classifyUpdate(current, latest),
              upgradeable,
              versions: versionsDesc,
              deprecated,
              vulns,
              vulnVersions,
            };
          } catch (e: any) {
            return { ...base, error: e?.message ?? 'error' };
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

  private async packageVulns(ecosystem: string | undefined, name: string, timeoutMs: number): Promise<RawVuln[]> {
    if (!ecosystem) return [];
    const key = `${ecosystem}:${name}`;
    const cached = this.vulnCache.get(key);
    if (cached) return cached;
    let raws: RawVuln[] = [];
    try {
      raws = await queryPackage(ecosystem, name, timeoutMs);
    } catch {
      raws = [];
    }
    this.vulnCache.set(key, raws);
    return raws;
  }

  async findTargetVulns(
    items: { id: string; version: string }[]
  ): Promise<{ name: string; version: string; vulns: RawVuln[] }[]> {
    const timeoutMs = config().get<number>('requestTimeoutMs', 8000);
    const out: { name: string; version: string; vulns: RawVuln[] }[] = [];
    await mapLimit(items, 6, async (it) => {
      const found = this.findDependency(it.id);
      if (!found?.provider.osvEcosystem || !it.version) return;
      const raws = await this.packageVulns(found.provider.osvEcosystem, found.dep.name, timeoutMs);
      const hits = raws.filter((r) => affectsVersion(it.version, r));
      if (hits.length) out.push({ name: found.dep.name, version: it.version, vulns: hits });
    });
    return out;
  }

  async updateDependency(id: string, version: string): Promise<void> {
    const found = this.findDependency(id);
    if (!found) return;
    const { dep, provider } = found;
    this.writeManifest(dep.manifestPath, (content) => provider.rewrite(content, dep, version));
    this.runInstall(provider, dep.manifestPath);
    this.optimistic([{ dep, version }]);
  }

  async updateMany(items: { id: string; version: string }[]): Promise<number> {
    const byManifest = new Map<string, { dep: Dependency; version: string }[]>();
    for (const item of items) {
      const found = this.findDependency(item.id);
      if (!found || !item.version || this.pins.has(item.id)) continue;
      const list = byManifest.get(found.dep.manifestPath) ?? [];
      list.push({ dep: found.dep, version: item.version });
      byManifest.set(found.dep.manifestPath, list);
    }
    let total = 0;
    const applied: { dep: Dependency; version: string }[] = [];
    for (const [manifestPath, list] of byManifest) {
      const provider = providerForFile(manifestPath);
      if (!provider) continue;
      this.writeManifest(manifestPath, (content) => {
        let out = content;
        for (const { dep, version } of list) out = provider.rewrite(out, dep, version);
        return out;
      });
      this.runInstall(provider, manifestPath);
      applied.push(...list);
      total += list.length;
    }
    if (applied.length > 0) this.optimistic(applied);
    return total;
  }

  async updateGroup(manifestPath: string): Promise<number> {
    const group = this.groups.find((g) => g.manifestPath === manifestPath);
    if (!group) return 0;
    const provider = providerForFile(manifestPath);
    if (!provider) return 0;
    const targets = group.dependencies.filter(
      (d) => d.latest && d.updateType !== 'none' && d.updateType !== 'unknown' && !this.pins.has(depId(d))
    );
    if (targets.length === 0) return 0;
    this.writeManifest(manifestPath, (content) => {
      let out = content;
      for (const d of targets) out = provider.rewrite(out, d, d.latest!);
      return out;
    });
    this.runInstall(provider, manifestPath);
    this.optimistic(targets.map((d) => ({ dep: d, version: d.latest! })));
    return targets.length;
  }

  private optimistic(updates: { dep: Dependency; version: string }[]): void {
    const includePre = config().get<boolean>('includePrerelease', false);
    for (const u of updates) {
      const id = depId(u.dep);
      for (const g of this.groups) {
        const live = g.dependencies.find((d) => depId(d) === id);
        if (!live) continue;
        live.current = u.version;
        live.error = undefined;
        const info = this.versionCache.get(`${g.ecosystem}:${live.name}`);
        const versions = info?.versions ?? (live.latest ? [live.latest] : []);
        live.upgradeable = upgradeableVersions(u.version, versions, includePre);
        live.updateType = live.latest ? classifyUpdate(u.version, live.latest) : 'none';
      }
    }
    this._onDidChange.fire();
  }

  async updateAll(): Promise<number> {
    let total = 0;
    for (const g of [...this.groups]) total += await this.updateGroup(g.manifestPath);
    return total;
  }

  async findConflicts(items: { id: string; version: string }[]): Promise<Conflict[]> {
    const timeoutMs = config().get<number>('requestTimeoutMs', 8000);
    const conflicts: Conflict[] = [];
    const selected = new Set(items.map((i) => i.id));
    const byManifest = new Map<string, { dep: Dependency; version: string }[]>();
    for (const it of items) {
      const found = this.findDependency(it.id);
      if (!found || !it.version) continue;
      const arr = byManifest.get(found.dep.manifestPath) ?? [];
      arr.push({ dep: found.dep, version: it.version });
      byManifest.set(found.dep.manifestPath, arr);
    }

    for (const [manifestPath, list] of byManifest) {
      const provider = providerForFile(manifestPath);
      if (!provider?.peerDependencies) continue;
      const group = this.groups.find((g) => g.manifestPath === manifestPath);
      if (!group) continue;

      const resolved = new Map<string, string>();
      const depByName = new Map<string, Dependency>();
      for (const d of group.dependencies) {
        depByName.set(d.name, d);
        if (d.current) resolved.set(d.name, cleanVersion(d.current));
      }
      for (const { dep, version } of list) resolved.set(dep.name, cleanVersion(version));

      await mapLimit(list, 6, async ({ dep, version }) => {
        const key = `${dep.name}@${version}`;
        let peers = this.peerCache.get(key);
        if (!peers) {
          try {
            peers = await provider.peerDependencies!(dep.name, version, timeoutMs);
          } catch {
            peers = {};
          }
          this.peerCache.set(key, peers);
        }
        for (const [peerName, range] of Object.entries(peers)) {
          const actual = resolved.get(peerName);
          if (!actual || satisfies(actual, range)) continue;
          const peerDep = depByName.get(peerName);
          let fix: { id: string; version: string } | undefined;
          if (peerDep && !peerDep.pinned) {
            const candidate = peerDep.versions
              .filter((v) => satisfies(v, range) && compareVersions(v, actual) > 0)
              .sort(compareVersions)[0];
            if (candidate && !selected.has(depId(peerDep))) {
              fix = { id: depId(peerDep), version: candidate };
            }
          }
          conflicts.push({
            source: dep.name,
            sourceVersion: version,
            peer: peerName,
            requiredRange: range,
            actual,
            fix,
          });
        }
      });
    }
    return conflicts;
  }

  private writeManifest(manifestPath: string, transform: (content: string) => string): void {
    const content = fs.readFileSync(manifestPath, 'utf8');
    fs.writeFileSync(manifestPath, transform(content), 'utf8');
  }

  private runInstall(provider: EcosystemProvider, manifestPath: string): void {
    if (!config().get<boolean>('runInstallAfterUpdate', true)) return;
    let cmd = provider.installCommand(manifestPath);
    if (!cmd) return;
    if (provider.id === 'npm' && cmd.startsWith('npm ')) {
      const strategy = config().get<string>('npmPeerConflictStrategy', 'default');
      if (strategy === 'legacy-peer-deps') cmd += ' --legacy-peer-deps';
      else if (strategy === 'force') cmd += ' --force';
    }
    const cwd = path.dirname(manifestPath);
    const term =
      vscode.window.terminals.find((t) => t.name === 'Dep Checker') ??
      vscode.window.createTerminal({ name: 'Dep Checker', cwd });
    term.show(true);
    term.sendText(cmd);
  }
}
