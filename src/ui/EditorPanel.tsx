import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { useEditor } from '../state/editorStore';
import { Btn } from './common';
import { SoundEditor } from './SoundEditor';
import { TextureEditor } from './TextureEditor';

/** The open texture or sound editor; a tab shows it in place of its main area. */
export function EditorPanel() {
  const { target, close } = useEditor();
  const t = useT();
  const [bytes, setBytes] = useState<Uint8Array>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    setBytes(undefined);
    setError(undefined);
    if (!target) return;
    let alive = true;
    target.load().then(
      (b) => alive && (b ? setBytes(b) : setError('—')),
      (e) => alive && setError((e as Error).message),
    );
    return () => {
      alive = false;
    };
  }, [target]);

  if (!target) return null;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-neutral-950">
      {error ? (
        <div className="flex flex-col items-start gap-2 p-4 text-sm">
          <div className="text-red-300">{t('editor.loadFailed', { error })}</div>
          <Btn onClick={close}>{t('actions.close')}</Btn>
        </div>
      ) : !bytes ? (
        <div className="p-4 text-sm text-neutral-400">…</div>
      ) : target.kind === 'texture' ? (
        <TextureEditor key={target.path} path={target.path} bytes={bytes} onDone={close} />
      ) : (
        <SoundEditor key={target.path} path={target.path} bytes={bytes} onSave={target.onSave} onDone={close} />
      )}
    </div>
  );
}
