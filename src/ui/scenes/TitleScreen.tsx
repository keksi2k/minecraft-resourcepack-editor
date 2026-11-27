import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { AssetStore } from '../../assets/AssetStore';
import { useT } from '../../i18n';
import { decodeImage, encodePng } from '../../render/png';
import { loadTexture } from '../../render/textures';
import { drawCentered, drawSprite, drawText, type Sprite } from '../../scenes/draw';
import { textWidth, type Font } from '../../scenes/font';
import { equirectToFaces, faceSizeFor, PANORAMA_FACES, panoramaKey, panoramaPath } from '../../scenes/panorama';
import { splashLines } from '../../texts/formatting';
import { useApp } from '../../state/appStore';
import { Btn, pickFile } from '../common';
import { Section, TextureRow } from '../ItemDetail';
import { SceneLayout } from './ScenesView';
import { GuiCanvas, guiScale, inside, useElementSize, useFont, useSprites, type DrawState } from './gui';

const FACE_NAMES = ['front', 'right', 'back', 'left', 'up', 'down'] as const;
const SPRITES = [
  'minecraft:gui/title/minecraft',
  'minecraft:gui/title/edition',
  'minecraft:gui/sprites/widget/button',
  'minecraft:gui/sprites/widget/button_highlighted',
  'minecraft:gui/sprites/icon/language',
  'minecraft:gui/sprites/icon/accessibility',
] as const;
const SPLASHES = 'assets/minecraft/texts/splashes.txt';

/** Loads the vanilla panorama from the asset index; it isn't part of the client jar. */
export function useVanillaPanorama() {
  const { store, objects, ensureVanillaObjects } = useApp();
  useEffect(() => {
    if (store && objects) void ensureVanillaObjects([0, 1, 2, 3, 4, 5].map((i) => [panoramaPath(i), panoramaKey(i)]));
  }, [store, objects, ensureVanillaObjects]);
}

export interface Look {
  /** Degrees turned to the right, and looked down. */
  yaw: number;
  pitch: number;
}

function PanoramaCube({ store, speed, look }: { store: AssetStore; speed: number; look: React.MutableRefObject<Look> }) {
  const revision = useApp((s) => s.revision);
  const key = [0, 1, 2, 3, 4, 5].map((i) => store.rev(panoramaPath(i))).join('.');
  const [textures, setTextures] = useState<(THREE.Texture | undefined)[]>([]);
  void revision;
  useEffect(() => {
    let alive = true;
    const made: THREE.Texture[] = [];
    void Promise.all([0, 1, 2, 3, 4, 5].map((i) => (store.has(panoramaPath(i)) ? loadTexture(store, `minecraft:gui/title/background/panorama_${i}`) : undefined))).then((infos) => {
      if (!alive) return;
      setTextures(
        infos.map((info) => {
          if (!info) return undefined;
          const tex = new THREE.CanvasTexture(info.canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          made.push(tex);
          return tex;
        }),
      );
    });
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key]);
  const placements = useMemo(
    () =>
      PANORAMA_FACES.map((f) => {
        const right = new THREE.Vector3(...f.right);
        const up = new THREE.Vector3(...f.up);
        const m = new THREE.Matrix4().makeBasis(right, up, right.clone().cross(up));
        return { position: new THREE.Vector3(...f.forward), quaternion: new THREE.Quaternion().setFromRotationMatrix(m) };
      }),
    [],
  );
  useFrame(({ camera }, delta) => {
    // the game turns the panorama slowly to the right, looking 10° down
    look.current.yaw += delta * speed * 2;
    camera.rotation.order = 'YXZ';
    camera.rotation.set((-look.current.pitch * Math.PI) / 180, (-look.current.yaw * Math.PI) / 180, 0);
  });
  return (
    <>
      {placements.map((p, i) => (
        <mesh key={i} position={p.position} quaternion={p.quaternion}>
          {/* a hair larger, so no seams show between the faces */}
          <planeGeometry args={[2.002, 2.002]} />
          <meshBasicMaterial key={textures[i]?.uuid ?? 'none'} map={textures[i]} color={textures[i] ? '#fff' : '#333'} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

const button = (s: Record<string, Sprite>, hover: boolean) => s[`minecraft:gui/sprites/widget/${hover ? 'button_highlighted' : 'button'}`];

/** The title screen's menu in GUI pixels, laid out like the game's. */
function drawMenu(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  font: Font,
  s: Record<string, Sprite>,
  names: Record<string, string>,
  splash: string,
  version: string,
  { time, mouse }: DrawState,
) {
  const logo = s['minecraft:gui/title/minecraft'];
  const edition = s['minecraft:gui/title/edition'];
  // the logo is the top 44 of 64 rows, the edition the top 14 of 16
  if (!logo.tex.missing) ctx.drawImage(logo.tex.canvas, 0, 0, logo.tex.width, (logo.tex.height * 44) / 64, Math.round(w / 2 - 128), 30, 256, 44);
  if (!edition.tex.missing) ctx.drawImage(edition.tex.canvas, 0, 0, edition.tex.width, (edition.tex.height * 14) / 16, Math.round(w / 2 - 64), 67, 128, 14);

  if (splash) {
    ctx.save();
    ctx.translate(w / 2 + 123, 69);
    ctx.rotate((-20 * Math.PI) / 180);
    let f = 1.8 - Math.abs(Math.sin(((time % 1000) / 1000) * Math.PI * 2)) * 0.1;
    const width = textWidth(font, splash);
    f = (f * 100) / (width + 32);
    ctx.scale(f, f);
    drawCentered(ctx, font, splash, 0, -8, { color: '#ffff00' });
    ctx.restore();
  }

  const top = Math.floor(h / 4) + 48;
  const buttons: [string, number, number, number][] = [
    [names['menu.singleplayer'] ?? 'Singleplayer', w / 2 - 100, top, 200],
    [names['menu.multiplayer'] ?? 'Multiplayer', w / 2 - 100, top + 24, 200],
    [names['menu.online'] ?? 'Minecraft Realms', w / 2 - 100, top + 48, 200],
    [names['menu.options'] ?? 'Options...', w / 2 - 100, top + 84, 98],
    [names['menu.quit'] ?? 'Quit Game', w / 2 + 2, top + 84, 98],
    ['', w / 2 - 124, top + 84, 20],
    ['', w / 2 + 104, top + 84, 20],
  ];
  buttons.forEach(([label, bx, by, bw], i) => {
    const x = Math.round(bx);
    const hover = inside(mouse, x, by, bw, 20);
    drawSprite(ctx, button(s, hover), x, by, bw, 20);
    if (label) drawCentered(ctx, font, label, x + bw / 2, by + 6, { color: '#ffffff' });
    const icon = i === 5 ? s['minecraft:gui/sprites/icon/language'] : i === 6 ? s['minecraft:gui/sprites/icon/accessibility'] : undefined;
    if (icon && !icon.tex.missing) ctx.drawImage(icon.tex.canvas, x + 2, by + 2, 15, 15);
  });
  drawText(ctx, font, `Minecraft ${version}`, 2, h - 10);
  const copyright = 'Copyright Mojang AB. Do not distribute!';
  drawText(ctx, font, copyright, w - textWidth(font, copyright) - 2, h - 10);
}

/** The title screen: the turning panorama, logo, splash text and buttons, all from the pack. */
export function TitleScreen({ store }: { store: AssetStore }) {
  const t = useT();
  const { names, version, objects, soundsError, applyBatch } = useApp();
  useVanillaPanorama();
  const font = useFont(store);
  const sprites = useSprites(store, SPRITES);
  const [ref, [cw, ch]] = useElementSize<HTMLDivElement>();
  const [speed, setSpeed] = useState(1);
  const look = useRef<Look>({ yaw: 0, pitch: 10 });
  const drag = useRef<[number, number]>();
  const [menu, setMenu] = useState(true);
  const revision = useApp((s) => s.revision);
  const splashes = useMemo(() => splashLines(new TextDecoder().decode(store.get(SPLASHES) ?? new Uint8Array())), [store, revision]);
  const [splashIndex, setSplashIndex] = useState(() => Math.floor(Math.random() * 1e6));
  const splash = splashes.length ? splashes[splashIndex % splashes.length] : '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const scale = guiScale(cw, ch);
  const gw = Math.max(1, Math.ceil(cw / scale));
  const gh = Math.max(1, Math.ceil(ch / scale));
  const missing = [0, 1, 2, 3, 4, 5].filter((i) => !store.has(panoramaPath(i)));

  const import360 = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const src = await decodeImage(file);
      if (src.width < src.height * 1.5) throw new Error(t('scenes.title.not360', { w: src.width, h: src.height }));
      const faces = equirectToFaces(src, faceSizeFor(src.width));
      const pngs = await Promise.all(faces.map(encodePng));
      applyBatch(new Map(pngs.map((png, i) => [panoramaPath(i), png])));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SceneLayout
      main={
        <div
          ref={ref}
          className="absolute inset-0 cursor-grab touch-none overflow-hidden bg-black active:cursor-grabbing"
          title={t('scenes.title.dragHint')}
          onPointerDown={(e) => {
            drag.current = [e.clientX, e.clientY];
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const [x, y] = drag.current;
            drag.current = [e.clientX, e.clientY];
            look.current.yaw -= (e.clientX - x) * 0.2;
            look.current.pitch = Math.max(-89, Math.min(89, look.current.pitch - (e.clientY - y) * 0.2));
          }}
          onPointerUp={() => (drag.current = undefined)}
        >
          <Canvas className="!absolute inset-0" camera={{ position: [0, 0, 0], fov: 85, near: 0.01, far: 10 }} onCreated={({ gl }) => (gl.outputColorSpace = THREE.SRGBColorSpace)}>
            <PanoramaCube store={store} speed={speed} look={look} />
          </Canvas>
          {menu && font && sprites && cw > 0 && (
            <div className="pointer-events-auto absolute left-0 top-0">
              <GuiCanvas
                width={gw}
                height={gh}
                scale={scale}
                animate
                draw={(ctx, s) => drawMenu(ctx, gw, gh, font, sprites, names, splash, version?.id ?? '', s)}
                onClick={() => setSplashIndex((n) => n + 1)}
              />
            </div>
          )}
        </div>
      }
      aside={
        <>
          <div className="p-3">
            <h2 className="text-base font-semibold">{t('scenes.title.title')}</h2>
            <p className="text-xs text-neutral-400">{t('scenes.title.hint')}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={menu} onChange={(e) => setMenu(e.target.checked)} /> {t('scenes.title.showMenu')}
              </label>
              <label className="flex items-center gap-1">
                {t('scenes.title.speed')}
                <input type="range" min={0} max={4} step={0.25} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
              </label>
              {splashes.length > 1 && <Btn onClick={() => setSplashIndex((n) => n + 1)}>{t('texts.splashes.random')}</Btn>}
            </div>
            {missing.length > 0 && (
              <p className="mt-2 rounded bg-amber-950 p-2 text-xs text-amber-200">
                {objects ? t('scenes.title.loading') : soundsError ? t('scenes.title.noIndex', { error: soundsError }) : t('scenes.title.loading')}
              </p>
            )}
          </div>
          <Section title={t('scenes.title.faces')}>
            <p className="mb-2 text-xs text-neutral-400">{t('scenes.title.facesHint')}</p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Btn tone="primary" onClick={() => void import360()} disabled={busy}>
                {busy ? t('scenes.title.converting') : t('scenes.title.import360')}
              </Btn>
              <span className="text-[11px] text-neutral-500">{t('scenes.title.import360Hint')}</span>
            </div>
            {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
            <div className="flex flex-col gap-3">
              {FACE_NAMES.map((name, i) => (
                <div key={name}>
                  <div className="mb-1 text-[11px] text-neutral-400">
                    {i}: {t(`scenes.title.face.${name}`)}
                  </div>
                  <TextureRow store={store} id={`minecraft:gui/title/background/panorama_${i}`} />
                </div>
              ))}
            </div>
          </Section>
          <Section title={t('scenes.title.menuFiles')}>
            <div className="flex flex-col gap-3">
              {SPRITES.map((id) => (
                <TextureRow key={id} store={store} id={id} />
              ))}
            </div>
          </Section>
        </>
      }
    />
  );
}
