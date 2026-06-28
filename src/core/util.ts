export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rangePrefix(declared: string): string {
  const m = declared.trim().match(/^(\^|~|>=|<=|==|>|<|=)?/);
  const p = m?.[1] ?? '';
  return p === '==' || p === '=' ? '' : p;
}
