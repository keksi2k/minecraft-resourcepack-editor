import { useMemo } from 'react';
import type { AssetStore } from '../assets/AssetStore';
import type { MobDef } from '../entities/catalog';
import {
  equipmentFor,
  HORSE_MARKINGS,
  mobCapabilities,
  PROFESSION_LEVELS,
  PROFESSIONS,
  VILLAGER_TYPES,
  type ArmorSlot,
  type MobOptions,
} from '../entities/equipment';
import { DYE } from '../entities/specials';
import { useT } from '../i18n';
import { parseRL } from '../models/resourceLocation';
import { useApp } from '../state/appStore';

/** Item names of armour pieces differ from the equipment ids (gold → golden, turtle_scute → turtle). */
const ITEM_MATERIAL: Record<string, string> = { gold: 'golden', turtle_scute: 'turtle' };
/** Biome names of the villager types in Minecraft's language files. */
const TYPE_BIOME: Record<string, string> = { snow: 'snowy_plains' };

const pretty = (id: string) => parseRL(id).path.replace(/_/g, ' ');

/**
 * Preview-only equipment and looks of a mob: armour, body armour, saddle, collar, horse markings,
 * villager biome and profession, charged glow, mooshroom mushrooms. Their textures come from the
 * pack and show up under Textures below, ready to edit.
 */
export function MobLookPanel({ store, mob, value, onChange }: { store: AssetStore; mob: MobDef; value: MobOptions; onChange: (o: MobOptions) => void }) {
  const t = useT();
  const names = useApp((s) => s.names);
  const revision = useApp((s) => s.revision);
  const caps = useMemo(() => mobCapabilities(mob), [mob]);
  const baby = !!mob.babyOf;
  const materials = useMemo(() => {
    const of = (type: string) => equipmentFor(store, type);
    return {
      humanoid: of(baby ? 'humanoid_baby' : 'humanoid'),
      leggings: of(baby ? 'humanoid_baby' : 'humanoid_leggings'),
      body: caps.body ? of(caps.body) : [],
    };
  }, [store, baby, caps.body, revision]);
  const set = (patch: Partial<MobOptions>) => onChange({ ...value, ...patch });
  const any = caps.armor.length || caps.body || caps.saddle || caps.collar || caps.markings || caps.villager || caps.charged || caps.mushrooms;
  if (!any) return null;

  const armorLabel = (id: string, slot: ArmorSlot) => {
    const { path } = parseRL(id);
    return names[`item.minecraft.${ITEM_MATERIAL[path] ?? path}_${slot}`] ?? pretty(id);
  };
  const bodyLabel = (id: string) => {
    const { path } = parseRL(id);
    const item = caps.body === 'horse_body' ? `${ITEM_MATERIAL[path] ?? path}_horse_armor` : caps.body === 'nautilus_body' ? `${ITEM_MATERIAL[path] ?? path}_nautilus_armor` : caps.body === 'wolf_body' ? 'wolf_armor' : path;
    return names[`item.minecraft.${item}`] ?? names[`block.minecraft.${item}`] ?? pretty(id);
  };
  const select = 'min-w-0 max-w-56 rounded bg-neutral-800 px-1 py-0.5';
  const row = (label: string, control: React.ReactNode, key?: string) => (
    <label key={key} className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-neutral-400">{label}</span>
      {control}
    </label>
  );

  return (
    <section className="border-t border-neutral-800 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t('mobs.look.title')}</h3>
      <div className="flex flex-col gap-2 text-xs">
        <p className="text-neutral-400">{t('mobs.look.intro')}</p>
        {caps.armor.map((slot) => {
          const list = slot === 'leggings' ? materials.leggings : materials.humanoid;
          return row(
            t(`mobs.look.${slot}`),
            <select value={value.armor?.[slot] ?? ''} onChange={(e) => set({ armor: { ...value.armor, [slot]: e.target.value || undefined } })} className={select}>
              <option value="">{t('mobs.look.none')}</option>
              {list.map((id) => (
                <option key={id} value={id}>
                  {armorLabel(id, slot)}
                </option>
              ))}
            </select>,
            slot,
          );
        })}
        {caps.body &&
          row(
            t(caps.body === 'llama_body' ? 'mobs.look.carpet' : caps.body === 'happy_ghast_body' ? 'mobs.look.harness' : 'mobs.look.body'),
            <select value={value.body ?? ''} onChange={(e) => set({ body: e.target.value || undefined })} className={select}>
              <option value="">{t('mobs.look.none')}</option>
              {materials.body.map((id) => (
                <option key={id} value={id}>
                  {bodyLabel(id)}
                </option>
              ))}
            </select>,
          )}
        {caps.saddle &&
          row(t('mobs.look.saddle'), <input type="checkbox" checked={!!value.saddle} onChange={(e) => set({ saddle: e.target.checked || undefined })} />)}
        {caps.collar &&
          row(
            t('mobs.look.collar'),
            <select value={value.collar ?? ''} onChange={(e) => set({ collar: e.target.value || undefined })} className={select}>
              <option value="">{t('mobs.look.none')}</option>
              {Object.keys(DYE).map((c) => (
                <option key={c} value={c}>
                  {names[`color.minecraft.${c}`] ?? c.replace(/_/g, ' ')}
                </option>
              ))}
            </select>,
          )}
        {caps.markings &&
          row(
            t('mobs.look.markings'),
            <select value={value.markings ?? ''} onChange={(e) => set({ markings: (e.target.value || undefined) as MobOptions['markings'] })} className={select}>
              <option value="">{t('mobs.look.none')}</option>
              {HORSE_MARKINGS.map((m) => (
                <option key={m} value={m}>
                  {t(`mobs.look.marking.${m}`)}
                </option>
              ))}
            </select>,
          )}
        {caps.villager &&
          row(
            t('mobs.look.villagerType'),
            <select value={value.villagerType ?? 'plains'} onChange={(e) => set({ villagerType: e.target.value as MobOptions['villagerType'] })} className={select}>
              {VILLAGER_TYPES.map((v) => (
                <option key={v} value={v}>
                  {names[`biome.minecraft.${TYPE_BIOME[v] ?? v}`] ?? v}
                </option>
              ))}
            </select>,
          )}
        {caps.profession &&
          row(
            t('mobs.look.profession'),
            <select value={value.profession ?? 'none'} onChange={(e) => set({ profession: e.target.value as MobOptions['profession'] })} className={select}>
              {PROFESSIONS.map((p) => (
                <option key={p} value={p}>
                  {p === 'none' ? t('mobs.look.none') : (names[`entity.minecraft.villager.${p}`] ?? p)}
                </option>
              ))}
            </select>,
          )}
        {caps.profession &&
          value.profession &&
          value.profession !== 'none' &&
          value.profession !== 'nitwit' &&
          row(
            t('mobs.look.level'),
            <select value={value.level ?? 'stone'} onChange={(e) => set({ level: e.target.value as MobOptions['level'] })} className={select}>
              {PROFESSION_LEVELS.map((l, i) => (
                <option key={l} value={l}>
                  {names[`merchant.level.${i + 1}`] ?? l}
                </option>
              ))}
            </select>,
          )}
        {caps.charged &&
          row(
            t(mob.entity === 'wither' ? 'mobs.look.witherArmor' : 'mobs.look.charged'),
            <input type="checkbox" checked={!!value.charged} onChange={(e) => set({ charged: e.target.checked || undefined })} />,
          )}
        {caps.mushrooms &&
          row(t('mobs.look.mushrooms'), <input type="checkbox" checked={value.mushrooms !== false} onChange={(e) => set({ mushrooms: e.target.checked ? undefined : false })} />)}
      </div>
    </section>
  );
}
