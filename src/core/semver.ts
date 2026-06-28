import { UpdateType } from './types';

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export function cleanVersion(raw: string): string {
  if (!raw) return '';
  const v = raw.trim();
  const m = v.match(/\d+(\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?/);
  return m ? m[0] : '';
}

export function parseVersion(raw: string): ParsedVersion | undefined {
  const clean = cleanVersion(raw);
  if (!clean) return undefined;
  const [core, pre] = clean.split('-');
  const parts = core.split('.').map((n) => parseInt(n, 10));
  if (parts.some(isNaN)) return undefined;
  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0,
    prerelease: pre ? pre.split('.') : [],
  };
}

export function isPrerelease(raw: string): boolean {
  const p = parseVersion(raw);
  return !!p && p.prerelease.length > 0;
}

export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1;
  }
  if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0;
  if (pa.prerelease.length === 0) return 1;
  if (pb.prerelease.length === 0) return -1;
  const len = Math.max(pa.prerelease.length, pb.prerelease.length);
  for (let i = 0; i < len; i++) {
    const x = pa.prerelease[i];
    const y = pb.prerelease[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      const d = parseInt(x, 10) - parseInt(y, 10);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (nx !== ny) {
      return nx ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

export function classifyUpdate(current: string, latest: string): UpdateType {
  const c = parseVersion(current);
  const l = parseVersion(latest);
  if (!c || !l) return 'unknown';
  if (compareVersions(current, latest) >= 0) return 'none';
  if (l.major > c.major) return 'major';
  if (l.minor > c.minor) return 'minor';
  if (l.patch > c.patch) return 'patch';
  return 'patch';
}

export function upgradeableVersions(
  current: string,
  versions: string[],
  includePrerelease: boolean
): string[] {
  return versions
    .filter((v) => !!cleanVersion(v))
    .filter((v) => includePrerelease || !isPrerelease(v))
    .filter((v) => compareVersions(v, current) > 0)
    .sort(compareVersions);
}

export function pickLatest(versions: string[], includePrerelease: boolean): string | undefined {
  const candidates = versions
    .filter((v) => !!cleanVersion(v))
    .filter((v) => includePrerelease || !isPrerelease(v));
  if (candidates.length === 0) return undefined;
  return candidates.reduce((max, v) => (compareVersions(v, max) > 0 ? v : max));
}
