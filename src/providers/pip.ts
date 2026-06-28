import * as fs from 'fs';
import * as path from 'path';
import { ParsedDep, VersionInfo } from '../core/types';
import { fetchJson } from '../core/http';
import { cleanVersion } from '../core/semver';
import { escapeRegExp } from '../core/util';
import { EcosystemProvider } from './provider';

function parseRequirements(content: string): ParsedDep[] {
  const lines = content.split('\n');
  const result: ParsedDep[] = [];
  lines.forEach((raw, idx) => {
    const line = raw.split('#')[0].trim();
    if (!line || line.startsWith('-') || line.includes('://')) return;
    const m = line.match(/^([A-Za-z0-9._-]+)\s*(\[[^\]]*\])?\s*(==|~=|>=|<=|!=|>|<)?\s*([0-9][^\s;,]*)?/);
    if (!m) return;
    const name = m[1];
    const op = m[3] ?? '';
    const ver = m[4] ?? '';
    result.push({
      name,
      declared: `${op}${ver}`,
      current: op === '==' || op === '~=' ? cleanVersion(ver) : cleanVersion(ver),
      section: 'requirements',
      line: idx,
    });
  });
  return result;
}

function parsePyproject(content: string): ParsedDep[] {
  const lines = content.split('\n');
  const result: ParsedDep[] = [];
  let section: string | undefined;
  let inArray = false;
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    const header = line.match(/^\[([^\]]+)\]/);
    if (header) {
      section = header[1];
      inArray = false;
      return;
    }
    const isPoetryDeps = !!section && /tool\.poetry.*dependencies/.test(section);
    const isPep621 = !!section && section === 'project';

    if (isPoetryDeps) {
      const m = line.match(/^([A-Za-z0-9._-]+)\s*=\s*"([^"]+)"/);
      if (m && m[1].toLowerCase() !== 'python') {
        result.push({ name: m[1], declared: m[2], current: cleanVersion(m[2]), section: section!, line: idx });
      }
      return;
    }
    if (isPep621) {
      if (/^dependencies\s*=\s*\[/.test(line)) inArray = true;
      if (inArray) {
        const dm = line.match(/"([A-Za-z0-9._-]+)\s*(?:\[[^\]]*\])?\s*([=~<>!]+)?\s*([0-9][^"\s;,]*)?/);
        if (dm) {
          result.push({
            name: dm[1],
            declared: `${dm[2] ?? ''}${dm[3] ?? ''}`,
            current: cleanVersion(dm[3] ?? ''),
            section: 'project.dependencies',
            line: idx,
          });
        }
        if (line.includes(']')) inArray = false;
      }
    }
  });
  return result;
}

export const pipProvider: EcosystemProvider = {
  id: 'pip',
  label: 'Python',
  osvEcosystem: 'PyPI',
  manifestFileNames: ['requirements.txt', 'pyproject.toml'],

  matches(filePath) {
    const base = path.basename(filePath);
    return base === 'pyproject.toml' || /^requirements.*\.txt$/.test(base);
  },

  async parse(manifestPath, content) {
    return path.basename(manifestPath) === 'pyproject.toml'
      ? parsePyproject(content)
      : parseRequirements(content);
  },

  async fetchVersions(name, timeoutMs) {
    const data = await fetchJson<any>(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      timeoutMs,
    });
    const versions = Object.keys(data.releases ?? {});
    if (versions.length === 0) return undefined;
    return { latest: data.info?.version ?? versions[versions.length - 1], versions } as VersionInfo;
  },

  rewrite(content, dep, newVersion) {
    const lines = content.split('\n');
    const i = dep.line;
    if (i < 0 || i >= lines.length) return content;
    const nameRe = escapeRegExp(dep.name);
    if (new RegExp(`^\\s*${nameRe}\\s*=`).test(lines[i])) {
      lines[i] = lines[i].replace(/("?)([\^~>=<!]*)([0-9][0-9A-Za-z.\-+]*)/, (_m, q, op) => {
        const keep = op && /[\^~]/.test(op) ? op : op || '';
        return `${q}${keep}${newVersion}`;
      });
    } else {
      lines[i] = lines[i].replace(
        /([=~<>!]=?|==)?\s*[0-9][0-9A-Za-z.\-+]*/,
        `==${newVersion}`
      );
      if (!/[0-9]/.test(lines[i].split('#')[0])) {
        lines[i] = lines[i].replace(/(\s*#.*)?$/, (c) => `==${newVersion}${c ?? ''}`);
      }
    }
    return lines.join('\n');
  },

  registryUrl(name) {
    return `https://pypi.org/project/${name}/`;
  },

  installCommand(manifestPath) {
    const base = path.basename(manifestPath);
    if (base === 'pyproject.toml') {
      try {
        const c = fs.readFileSync(manifestPath, 'utf8');
        if (c.includes('[tool.poetry')) return 'poetry update';
      } catch {
        return '';
      }
      return 'pip install -U .';
    }
    return `pip install -U -r ${base}`;
  },
};
