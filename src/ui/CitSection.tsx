import { useMemo } from 'react';
import type { AssetStore } from '../assets/AssetStore';
import { useT } from '../i18n';
import { CUSTOM_NAME_FORMAT, namedId, namedModelJson, readNameRules, writeNameRules } from '../models/customNames';
import type { ItemEntry } from '../models/items';
import { itemDefinitionPath, modelPath, texturePath } from '../models/resourceLocation';
import { loadCitRules, type CitRule } from '../optifine/optifine';
import { useApp } from '../state/appStore';
import { Btn } from './common';
import { Section, TextureRow } from './ItemDetail';

const json = (o: unknown) => new TextEncoder().encode(JSON.stringify(o, null, 2));

/**
 * OptiFine's custom item textures (CIT) for this item. The game itself doesn't read them; rules
 * that only check the item's name can be turned into the game's own name rules (1.21.5+).
 */
export function CitSection({ store, item }: { store: AssetStore; item: ItemEntry }) {
  const t = useT();
  const { revision, setFile, gameFormat } = useApp();
  const rules = useMemo(() => loadCitRules(store).filter((r) => r.items.includes(item.id)), [store, item.id, revision]);
  if (!rules.length) return null;
  const defPath = itemDefinitionPath(item.id);
  const canConvert = store.has(defPath) && (gameFormat === undefined || gameFormat >= CUSTOM_NAME_FORMAT);
  const handheld = item.models.some((m) => m.model.chain.some((c) => /^minecraft:item\/handheld/.test(c)));
  const named = readNameRules(store.json(defPath));

  const convert = (rule: CitRule) => {
    const bytes = rule.texture && store.get(texturePath(rule.texture));
    if (!rule.exactName || !bytes) return;
    const id = namedId(item.id, rule.exactName, (x) => store.has(modelPath(x)) || store.has(texturePath(x)));
    setFile(texturePath(id), bytes);
    setFile(modelPath(id), json(namedModelJson(id, handheld)));
    setFile(defPath, json(writeNameRules(store.json(defPath), { ...named, rules: [...named.rules, { names: [rule.exactName], model: id }] })));
  };

  return (
    <Section title={t('optifine.cit.title', { count: rules.length })}>
      <p className="mb-2 text-xs text-neutral-400">{t('optifine.cit.hint')}</p>
      <div className="flex flex-col gap-3">
        {rules.map((r) => {
          const done = !!r.exactName && named.rules.some((n) => n.names.includes(r.exactName!));
          const textures = [r.texture, ...Object.values(r.textures)].filter((x): x is string => !!x && store.has(texturePath(x)));
          return (
            <div key={r.file} className="rounded bg-neutral-950 p-2 text-xs">
              <div className="break-all font-mono text-[11px] text-neutral-500">{r.file.replace(/^assets\/[^/]+\//, '')}</div>
              <ul className="my-1 text-neutral-300">
                {r.conditions.map(([k, v]) => (
                  <li key={k}>
                    <span className="text-neutral-500">{k}</span> = {v}
                  </li>
                ))}
                {r.model && (
                  <li>
                    <span className="text-neutral-500">model</span> = {r.model}
                  </li>
                )}
              </ul>
              <div className="flex flex-col gap-2">
                {textures.map((id) => (
                  <TextureRow key={id} store={store} id={id} />
                ))}
                {!textures.length && <span className="text-amber-300">{t('optifine.cit.noTexture')}</span>}
              </div>
              {r.exactName && textures.length > 0 && canConvert && (
                <div className="mt-2 flex items-center gap-2">
                  {done ? (
                    <span className="text-emerald-300">✓ {t('optifine.cit.converted', { name: r.exactName })}</span>
                  ) : (
                    <Btn onClick={() => convert(r)} title={t('optifine.cit.convertTitle')}>
                      {t('optifine.cit.convert', { name: r.exactName })}
                    </Btn>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
