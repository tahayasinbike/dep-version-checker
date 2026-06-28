import * as fs from 'fs';
import * as path from 'path';
import { ParsedDep, VersionInfo } from '../core/types';
import { fetchJson } from '../core/http';
import { cleanVersion, resolveCurrent } from '../core/semver';
import { escapeRegExp, rangePrefix } from '../core/util';
import { EcosystemProvider } from './provider';

const SECTIONS = ['require', 'require-dev'];

function lockVersions(manifestDir: string): Map<string, string> {
  const map = new Map<string, string>();
  const lockPath = path.join(manifestDir, 'composer.lock');
  if (!fs.existsSync(lockPath)) return map;
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    for (const key of ['packages', 'packages-dev']) {
      for (const p of lock[key] ?? []) {
        if (p.name && p.version) map.set(p.name, String(p.version).replace(/^v/, ''));
      }
    }
  } catch {
    return map;
  }
  return map;
}

export const composerProvider: EcosystemProvider = {
  id: 'composer',
  label: 'PHP',
  manifestFileNames: ['composer.json'],

  matches(filePath) {
    return path.basename(filePath) === 'composer.json';
  },

  async parse(manifestPath, content, manifestDir) {
    let json: any;
    try {
      json = JSON.parse(content);
    } catch {
      return [];
    }
    const locks = lockVersions(manifestDir);
    const lines = content.split('\n');
    const result: ParsedDep[] = [];
    for (const section of SECTIONS) {
      const deps = json[section];
      if (!deps || typeof deps !== 'object') continue;
      for (const name of Object.keys(deps)) {
        if (name === 'php' || !name.includes('/')) continue;
        const declared = String(deps[name]);
        const line = lines.findIndex((l) => new RegExp(`"${escapeRegExp(name)}"\\s*:`).test(l));
        result.push({
          name,
          declared,
          current: resolveCurrent(locks.get(name), declared),
          section,
          line,
        });
      }
    }
    return result;
  },

  async fetchVersions(name, timeoutMs) {
    const data = await fetchJson<any>(`https://repo.packagist.org/p2/${name}.json`, { timeoutMs });
    const releases = data.packages?.[name] ?? [];
    const versions = releases
      .map((r: any) => String(r.version).replace(/^v/, ''))
      .filter((v: string) => !!cleanVersion(v));
    if (versions.length === 0) return undefined;
    const stable = versions.find((v: string) => !v.includes('-'));
    return { latest: stable ?? versions[0], versions } as VersionInfo;
  },

  rewrite(content, dep, newVersion) {
    const lines = content.split('\n');
    const prefix = rangePrefix(dep.declared) || '^';
    const re = new RegExp(`("${escapeRegExp(dep.name)}"\\s*:\\s*")([^"]*)(")`);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        lines[i] = lines[i].replace(re, `$1${prefix}${newVersion}$3`);
        break;
      }
    }
    return lines.join('\n');
  },

  installCommand() {
    return 'composer update';
  },
};
