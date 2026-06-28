import { postJson } from './http';

export interface Vuln {
  id: string;
  summary?: string;
  severity?: string;
  fixed?: string;
}

export interface VulnQuery {
  ecosystem: string;
  name: string;
  version: string;
}

const QUERY = 'https://api.osv.dev/v1/query';
const BATCH = 'https://api.osv.dev/v1/querybatch';

export async function queryBatch(items: VulnQuery[], timeoutMs: number): Promise<string[][]> {
  if (items.length === 0) return [];
  const res = await postJson<any>(
    BATCH,
    { queries: items.map((i) => ({ version: i.version, package: { name: i.name, ecosystem: i.ecosystem } })) },
    { timeoutMs }
  );
  return (res.results ?? []).map((r: any) => (r?.vulns ?? []).map((v: any) => v.id as string));
}

export async function queryVulns(item: VulnQuery, timeoutMs: number): Promise<Vuln[]> {
  const res = await postJson<any>(
    QUERY,
    { version: item.version, package: { name: item.name, ecosystem: item.ecosystem } },
    { timeoutMs }
  );
  return (res.vulns ?? []).map(parseVuln);
}

function parseVuln(v: any): Vuln {
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
