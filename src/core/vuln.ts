import { postJson } from './http';
import { compareVersions } from './semver';

export interface RawVuln {
  id: string;
  summary?: string;
  severity?: string;
  fixed?: string;
  affected: any[];
}

const QUERY = 'https://api.osv.dev/v1/query';

export async function queryPackage(ecosystem: string, name: string, timeoutMs: number): Promise<RawVuln[]> {
  const res = await postJson<any>(QUERY, { package: { name, ecosystem } }, { timeoutMs });
  return (res.vulns ?? []).map((v: any) => ({
    ...parseVuln(v),
    affected: (v.affected ?? []).filter(
      (a: any) => a.package?.name === name && a.package?.ecosystem === ecosystem
    ),
  }));
}

export function affectsVersion(version: string, raw: RawVuln): boolean {
  for (const a of raw.affected ?? []) {
    if (Array.isArray(a.versions) && a.versions.includes(version)) return true;
    for (const r of a.ranges ?? []) {
      if ((r.type === 'SEMVER' || r.type === 'ECOSYSTEM') && affectedByRange(version, r)) return true;
    }
  }
  return false;
}

function affectedByRange(v: string, range: any): boolean {
  let introduced: string | null = null;
  for (const e of range.events ?? []) {
    if (e.introduced !== undefined) {
      introduced = e.introduced;
    } else if (e.fixed !== undefined && introduced !== null) {
      const lo = introduced === '0' ? null : introduced;
      if ((lo === null || compareVersions(v, lo) >= 0) && compareVersions(v, e.fixed) < 0) return true;
      introduced = null;
    } else if (e.last_affected !== undefined && introduced !== null) {
      const lo = introduced === '0' ? null : introduced;
      if ((lo === null || compareVersions(v, lo) >= 0) && compareVersions(v, e.last_affected) <= 0) return true;
      introduced = null;
    }
  }
  if (introduced !== null) {
    const lo = introduced === '0' ? null : introduced;
    if (lo === null || compareVersions(v, lo) >= 0) return true;
  }
  return false;
}

function parseVuln(v: any): { id: string; summary?: string; severity?: string; fixed?: string } {
  const cve = (v.aliases ?? []).find((a: string) => a.startsWith('CVE-'));
  return { id: cve ?? v.id, summary: v.summary, severity: v.database_specific?.severity, fixed: firstFixed(v) };
}

function firstFixed(v: any): string | undefined {
  for (const a of v.affected ?? []) {
    for (const r of a.ranges ?? []) {
      for (const e of r.events ?? []) {
        if (e.fixed) return e.fixed;
      }
    }
  }
  return undefined;
}
