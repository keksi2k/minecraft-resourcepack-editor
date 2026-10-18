import type { FunnySettings, FunnyStats } from './funny';

/** Applied funny changes: their settings, what they did, and every touched file's previous edit. */
export interface FunnyRecord {
  settings: FunnySettings;
  stats: FunnyStats;
  /** Path → edit before the funny changes (`undefined`: the file wasn't edited). */
  before: [string, Uint8Array | null | undefined][];
}
