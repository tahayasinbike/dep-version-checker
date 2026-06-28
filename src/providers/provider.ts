import { ParsedDep, VersionInfo } from '../core/types';

export interface EcosystemProvider {
  id: string;
  label: string;
  manifestFileNames: string[];
  matches(filePath: string): boolean;
  parse(manifestPath: string, content: string, manifestDir: string): Promise<ParsedDep[]>;
  fetchVersions(name: string, timeoutMs: number): Promise<VersionInfo | undefined>;
  rewrite(content: string, dep: ParsedDep, newVersion: string): string;
  installCommand(manifestPath: string): string;
  registryUrl(name: string): string;
  osvEcosystem?: string;
  peerDependencies?(name: string, version: string, timeoutMs: number): Promise<Record<string, string>>;
}

const registry: EcosystemProvider[] = [];

export function registerProvider(p: EcosystemProvider): void {
  registry.push(p);
}

export function allProviders(): EcosystemProvider[] {
  return registry;
}

export function providerForFile(filePath: string): EcosystemProvider | undefined {
  return registry.find((p) => p.matches(filePath));
}

export function manifestGlobs(): string[] {
  const names = new Set<string>();
  for (const p of registry) p.manifestFileNames.forEach((n) => names.add(n));
  return [...names].map((n) => `**/${n}`);
}
