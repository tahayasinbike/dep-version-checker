export type UpdateType = 'major' | 'minor' | 'patch' | 'none' | 'unknown';

export interface ParsedDep {
  name: string;
  declared: string;
  current?: string;
  section: string;
  line: number;
}

export interface VersionInfo {
  latest: string;
  versions: string[];
  deprecated?: string[];
}

export interface Dependency extends ParsedDep {
  ecosystem: string;
  manifestPath: string;
  latest?: string;
  updateType: UpdateType;
  upgradeable: string[];
  versions: string[];
  deprecated: string[];
  error?: string;
}

export interface ManifestGroup {
  manifestPath: string;
  ecosystem: string;
  ecosystemLabel: string;
  dependencies: Dependency[];
}
