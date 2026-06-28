import * as fs from 'fs';
import * as path from 'path';
import { ParsedDep, VersionInfo } from '../core/types';
import { fetchJson } from '../core/http';
import { resolveCurrent } from '../core/semver';
import { escapeRegExp, rangePrefix } from '../core/util';
import { EcosystemProvider } from './provider';

const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function installedVersion(manifestDir: string, name: string): string | undefined {
  try {
    const pkgPath = path.join(manifestDir, 'node_modules', ...name.split('/'), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const v = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
      if (typeof v === 'string') return v;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function lockVersion(lock: any, name: string): string | undefined {
  if (!lock) return undefined;
  if (lock.packages) {
    const entry = lock.packages[`node_modules/${name}`];
    if (entry?.version) return entry.version;
  }
  if (lock.dependencies?.[name]?.version) return lock.dependencies[name].version;
  return undefined;
}

export const npmProvider: EcosystemProvider = {
  id: 'npm',
  label: 'npm',
  manifestFileNames: ['package.json'],

  matches(filePath) {
    return path.basename(filePath) === 'package.json';
  },

  async parse(manifestPath, content, manifestDir) {
    let json: any;
    try {
      json = JSON.parse(content);
    } catch {
      return [];
    }
    let lock: any;
    const lockPath = path.join(manifestDir, 'package-lock.json');
    if (fs.existsSync(lockPath)) {
      try {
        lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      } catch {
        lock = undefined;
      }
    }
    const lines = content.split('\n');
    const result: ParsedDep[] = [];
    for (const section of SECTIONS) {
      const deps = json[section];
      if (!deps || typeof deps !== 'object') continue;
      for (const name of Object.keys(deps)) {
        const declared = String(deps[name]);
        if (/^(workspace:|file:|link:|git\+|https?:|github:)/.test(declared)) continue;
        const installed = installedVersion(manifestDir, name) ?? lockVersion(lock, name);
        const current = resolveCurrent(installed, declared);
        const line = lines.findIndex((l) =>
          new RegExp(`"${escapeRegExp(name)}"\\s*:`).test(l)
        );
        result.push({ name, declared, current, section, line });
      }
    }
    return result;
  },

  async fetchVersions(name, timeoutMs) {
    const data = await fetchJson<any>(`https://registry.npmjs.org/${name}`, { timeoutMs });
    const versionsObj = data.versions ?? {};
    const versions = Object.keys(versionsObj);
    if (versions.length === 0) return undefined;
    const latest = data['dist-tags']?.latest ?? versions[versions.length - 1];
    const deprecated = versions.filter((v) => versionsObj[v]?.deprecated);
    return { latest, versions, deprecated } as VersionInfo;
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

  installCommand(manifestPath) {
    const dir = path.dirname(manifestPath);
    if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm install';
    if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn install';
    if (fs.existsSync(path.join(dir, 'bun.lockb')) || fs.existsSync(path.join(dir, 'bun.lock')))
      return 'bun install';
    return 'npm install';
  },
};
