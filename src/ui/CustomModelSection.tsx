import { useState } from 'react';
import { parseLenientJson, type AssetStore } from '../assets/AssetStore';
import { useT, type MessageKey } from '../i18n';
import { bbmodelToJava, customModelId, giveCommand, javaModelImport, placeTextures, readCmdCases, writeCmdCases, type ImportWarning } from '../models/customModels';
import { readNameRules, writeNameRules, parseNames } from '../models/customNames';
import { stripNs } from '../models/itemDefinition';
import { usesItemDefinitions, type ItemEntry } from '../models/items';
import { itemDefinitionPath, modelPath, texturePath } from '../models/resourceLocation';
import { useApp } from '../state/appStore';
import { Btn, ensurePng, pickFiles } from './common';
import { Section } from './ItemDetail';

type Mode = 'replace' | 'name' | 'cmd';
type Json = Record<string, any>;

const json = (o: unknown) => new TextEncoder().encode(JSON.stringify(o, null, 2));
const isNameSelect = (n: Json | undefined) => !!n && stripNs(n.type) === 'select' && stripNs(n.property) === 'component' && stripNs(n.component) === 'custom_name';

/** The custom_model_data select sits inside a custom-name select's fallback if there is one. */
function cmdNode(def: Json | undefined): { node: Json | undefined; put: (node: Json | undefined) => Json } {
  const top = def?.model;
  if (isNameSelect(top)) return { node: top.fallback, put: (node) => ({ ...def, model: { ...top, fallback: node } }) };
  return { node: top, put: (node) => ({ ...def, model: node }) };
}

function warningText(t: ReturnType<typeof useT>, w: ImportWarning): string {
  return t(`models.warnings.${w.code}` as MessageKey, w as unknown as Record<string, string | number>);
}

/** Import a Blockbench or Java model for the item: replace it, show it for a name or a custom_model_data string. */
export function CustomModelSection({ store, item }: { store: AssetStore; item: ItemEntry }) {
  const t = useT();
  const { setFile } = useApp();
  useApp((s) => s.revision);
  const modern = usesItemDefinitions(store);
  const defPath = itemDefinitionPath(item.id);
  const def = modern ? store.json<Json>(defPath) : undefined;
  const { node } = cmdNode(def);
  const cmd = readCmdCases({ model: node });
  const [mode, setMode] = useState<Mode>(modern ? 'cmd' : 'replace');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok?: string; warnings: string[]; error?: string }>();
  const [copied, setCopied] = useState<string>();

  const writeDef = (next: Json) => setFile(defPath, json(next));
  const writeCmd = (cases: typeof cmd.cases) => {
    const cur = cmdNode(store.json<Json>(defPath));
    writeDef(cur.put(writeCmdCases({ model: cur.node }, cmd.base, cases, cmd.other).model));
  };

  const run = async () => {
    const names = mode === 'name' ? parseNames(value) : [];
    if (mode === 'name' && !names.length) return setResult({ warnings: [], error: t('models.needName') });
    if (mode === 'cmd' && !value.trim()) return setResult({ warnings: [], error: t('models.needValue') });
    const files = await pickFiles('.bbmodel,.json,.png', true);
    if (!files.length) return;
    setBusy(true);
    setResult(undefined);
    try {
      const bb = files.find((f) => /\.bbmodel$/i.test(f.name));
      const js = files.find((f) => /\.json$/i.test(f.name));
      const pngs = new Map(
        await Promise.all(files.filter((f) => /\.png$/i.test(f.name)).map(async (f) => [f.name, new Uint8Array(await f.arrayBuffer())] as [string, Uint8Array])),
      );
      let imported;
      if (bb) imported = bbmodelToJava(parseLenientJson(await bb.text()) as Json);
      else if (js) imported = javaModelImport(parseLenientJson(await js.text()) as Json, pngs, (id) => store.has(texturePath(id)));
      else throw new Error(t('models.noModel'));
      if (!imported.model.elements?.length && !imported.model.parent) throw new Error(t('models.empty'));
      const label = mode === 'replace' ? (bb ?? js)!.name.replace(/\.[^.]+$/, '') : mode === 'name' ? names[0] : value.trim();
      const id = customModelId(item.id, label, (x) => store.has(modelPath(x)));
      const placed = placeTextures(imported, id);
      for (const [tex, png] of placed.files) setFile(texturePath(tex), await ensurePng(png));
      setFile(modelPath(id), json(placed.model));

      if (!modern) {
        // before 1.21.4 the item's own model file decides how it looks
        setFile(modelPath(item.id.replace(/:/, ':item/')), json({ parent: id }));
      } else if (mode === 'replace') {
        const cur = cmdNode(def);
        writeDef(cur.put({ type: 'minecraft:model', model: id }));
      } else if (mode === 'name') {
        const rules = readNameRules(def);
        writeDef(writeNameRules(def, { ...rules, rules: [...rules.rules, { names, model: id }] }));
      } else {
        writeCmd([...cmd.cases.filter((c) => c.value !== value.trim()), { value: value.trim(), model: id }]);
      }
      setValue('');
      setResult({ ok: t('models.imported', { id }), warnings: imported.warnings.map((w) => warningText(t, w)) });
    } catch (e) {
      setResult({ warnings: [], error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(text);
    setTimeout(() => setCopied(undefined), 1500);
  };

  return (
    <Section title={t('models.title', { count: cmd.cases.length })}>
      <div className="flex flex-col gap-2 text-xs">
        <p className="text-neutral-400">{t('models.intro')}</p>
        {cmd.cases.map((c) => {
          const give = giveCommand(item.id, c.value);
          return (
            <div key={c.value} className="flex flex-col gap-1 rounded bg-neutral-900 p-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">“{c.value}”</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-neutral-500" title={c.model}>
                  {c.model}
                </span>
                <Btn tone="danger" onClick={() => writeCmd(cmd.cases.filter((x) => x !== c))} title={t('models.remove')}>
                  ✕
                </Btn>
              </div>
              <div className="flex items-center gap-1">
                <code className="min-w-0 flex-1 truncate rounded bg-neutral-950 px-1 py-0.5 text-[10px] text-emerald-300" title={give}>
                  {give}
                </code>
                <Btn onClick={() => copy(give)}>{copied === give ? '✓' : t('scenes.fonts.copy')}</Btn>
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-1">
          {(modern ? (['cmd', 'name', 'replace'] as Mode[]) : (['replace'] as Mode[])).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded px-2 py-1 ${mode === m ? 'bg-neutral-600' : 'bg-neutral-800 hover:bg-neutral-700'}`}>
              {t(`models.modes.${m}`)}
            </button>
          ))}
        </div>
        <p className="text-neutral-500">{t(`models.modeHint.${mode}`)}</p>
        <div className="flex items-center gap-2">
          {mode !== 'replace' && (
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t(mode === 'name' ? 'names.placeholder' : 'models.valuePlaceholder')}
              className="min-w-0 flex-1 rounded bg-neutral-800 px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
            />
          )}
          <Btn tone="primary" onClick={() => void run()} disabled={busy}>
            {busy ? t('models.importing') : t('models.import')}
          </Btn>
        </div>
        <p className="text-[11px] text-neutral-500">{t('models.files')}</p>
        {result?.error && <p className="text-red-400">{result.error}</p>}
        {result?.ok && <p className="text-emerald-400">{result.ok}</p>}
        {result?.warnings.map((w, i) => (
          <p key={i} className="text-amber-300">
            ⚠ {w}
          </p>
        ))}
      </div>
    </Section>
  );
}
