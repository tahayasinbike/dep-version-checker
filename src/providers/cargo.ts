import * as fs from 'fs';
import * as path from 'path';
import { ParsedDep, VersionInfo } from '../core/types';
import { fetchJson } from '../core/http';
import { resolveCurrent } from '../core/semver';
import { escapeRegExp } from '../core/util';
import { EcosystemProvider } from './provider';

const DEP_SECTIONS = ['dependencies', 'dev-dependencies', 'build-dependencies'];

function lockVersions(manifestDir: string): Map<string, string> {
  const map = new Map<string, string>();
  const lockPath = path.join(manifestDir, 'Cargo.lock');
  if (!fs.existsSync(lockPath)) return map;
  try {
    const blocks = fs.readFileSync(lockPath, 'utf8').split('[[package]]');
    for (const b of blocks) {
      const n = b.match(/name\s*=\s*"([^"]+)"/);
      const v = b.match(/version\s*=\s*"([^"]+)"/);
      if (n && v) map.set(n[1], v[1]);
    }
  } catch {
    return map;
  }
  return map;
}

function isDepSection(section: string | undefined): { active: boolean; tableName?: string } {
  if (!section) return { active: false };
  if (DEP_SECTIONS.includes(section)) return { active: true };
  for (const s of DEP_SECTIONS) {
    if (section.startsWith(`${s}.`)) return { active: true, tableName: section.slice(s.length + 1) };
  }
  return { active: false };
}

export const cargoProvider: EcosystemProvider = {
  id: 'cargo',
  label: 'Rust',
  osvEcosystem: 'crates.io',
  manifestFileNames: ['Cargo.toml'],

  matches(filePath) {
    return path.basename(filePath) === 'Cargo.toml';
  },

  async parse(manifestPath, content, manifestDir) {
    const locks = lockVersions(manifestDir);
    const lines = content.split('\n');
    const result: ParsedDep[] = [];
    let section: string | undefined;
    lines.forEach((raw, idx) => {
      const line = raw.trim();
      const header = line.match(/^\[([^\]]+)\]/);
      if (header) {
        section = header[1];
        return;
      }
      const ctx = isDepSection(section);
      if (!ctx.active || !line || line.startsWith('#')) return;

      if (ctx.tableName) {
        const vm = line.match(/^version\s*=\s*"([^"]+)"/);
        if (vm) {
          const name = ctx.tableName;
          result.push({
            name,
            declared: vm[1],
            current: resolveCurrent(locks.get(name), vm[1]),
            section: 'dependencies',
            line: idx,
          });
        }
        return;
      }

      const simple = line.match(/^([A-Za-z0-9._-]+)\s*=\s*"([^"]+)"/);
      const table = line.match(/^([A-Za-z0-9._-]+)\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/);
      const m = table ?? simple;
      if (m) {
        result.push({
          name: m[1],
          declared: m[2],
          current: resolveCurrent(locks.get(m[1]), m[2]),
          section: section!,
          line: idx,
        });
      }
    });
    return result;
  },

  async fetchVersions(name, timeoutMs) {
    const data = await fetchJson<any>(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`, {
      timeoutMs,
    });
    const versions = (data.versions ?? [])
      .filter((v: any) => !v.yanked)
      .map((v: any) => v.num as string);
    if (versions.length === 0) return undefined;
    const latest = data.crate?.max_stable_version ?? data.crate?.max_version ?? versions[0];
    return { latest, versions } as VersionInfo;
  },

  rewrite(content, dep, newVersion) {
    const lines = content.split('\n');
    const i = dep.line;
    if (i < 0 || i >= lines.length) return content;
    lines[i] = lines[i].replace(/"([^"]*)"/, `"${newVersion}"`);
    return lines.join('\n');
  },

  installCommand() {
    return 'cargo update';
  },

  registryUrl(name) {
    return `https://crates.io/crates/${name}`;
  },
};
