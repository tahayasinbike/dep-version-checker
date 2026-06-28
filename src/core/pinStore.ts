import * as fs from 'fs';
import * as path from 'path';

export class PinStore {
  private cache: Set<string> | undefined;

  constructor(private readonly filePath: string | undefined) {}

  private load(): Set<string> {
    if (this.cache) return this.cache;
    let pins: string[] = [];
    if (this.filePath) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        if (Array.isArray(parsed?.pins)) pins = parsed.pins.filter((p: unknown) => typeof p === 'string');
      } catch {
        pins = [];
      }
    }
    this.cache = new Set(pins);
    return this.cache;
  }

  reload(): void {
    this.cache = undefined;
  }

  has(id: string): boolean {
    return this.load().has(id);
  }

  async toggle(id: string): Promise<boolean> {
    const set = this.load();
    let pinned: boolean;
    if (set.has(id)) {
      set.delete(id);
      pinned = false;
    } else {
      set.add(id);
      pinned = true;
    }
    this.save(set);
    return pinned;
  }

  private save(set: Set<string>): void {
    if (!this.filePath) return;
    const body = JSON.stringify({ pins: [...set].sort() }, null, 2) + '\n';
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, body, 'utf8');
  }
}
