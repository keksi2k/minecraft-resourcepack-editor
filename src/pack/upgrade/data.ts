import type { SliceFile } from './slices';
import type { RenameStep, UpgradeData } from './upgrade';

/** The upgrade tables (a few hundred KB), loaded only when a pack is upgraded. */
export async function loadUpgradeData(): Promise<UpgradeData> {
  const [renames, slices] = await Promise.all([import('./renames.json'), import('./slices.json')]);
  return {
    renames: renames.default.steps as RenameStep[],
    slices: slices.default as unknown as SliceFile,
    langKeys: renames.default.langKeys as Record<string, string>,
  };
}
