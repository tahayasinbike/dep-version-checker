import * as fs from 'fs';
import * as path from 'path';

export class PinStore {
  private pins: Set<string> | undefined;
  private notes: Record<string, string> = {};

  constructor(private readonly filePath: string | undefined) {}

  private load(): Set<string> {
    if (this.pins) return this.pins;
    let ids: string[] = [];
    this.notes = {};
    if (this.filePath) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        if (Array.isArray(parsed?.pins)) ids = parsed.pins.filter((p: unknown) => typeof p === 'string');
        if (parsed?.notes && typeof parsed.notes === 'object') {
          for (const [k, v] of Object.entries(parsed.notes)) {
            if (typeof v === 'string') this.notes[k] = v;
          }
        }
      } catch {
        ids = [];
      }
    }
    this.pins = new Set(ids);
    return this.pins;
  }

  reload(): void {
    this.pins = undefined;
  }

  has(id: string): boolean {
    return this.load().has(id);
  }

  getNote(id: string): string | undefined {
    this.load();
    return this.notes[id];
  }

  async toggle(id: string): Promise<boolean> {
    const set = this.load();
    let pinned: boolean;
    if (set.has(id)) {
      set.delete(id);
      delete this.notes[id];
      pinned = false;
    } else {
      set.add(id);
      pinned = true;
    }
    this.save();
    return pinned;
  }

  async setNote(id: string, note: string): Promise<void> {
    this.load();
    if (note) this.notes[id] = note;
    else delete this.notes[id];
    this.save();
  }

  private save(): void {
    if (!this.filePath || !this.pins) return;
    const body = JSON.stringify({ pins: [...this.pins].sort(), notes: this.notes }, null, 2) + '\n';
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, body, 'utf8');
  }
}
