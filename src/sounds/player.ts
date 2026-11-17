import { useSyncExternalStore } from 'react';

let audio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
/** Which play button started the sound that is playing now, so that button can show "stop". */
let playingId: string | null = null;
const listeners = new Set<() => void>();

function setPlaying(id: string | null) {
  if (id === playingId) return;
  playingId = id;
  for (const l of listeners) l();
}

export function stopSound() {
  audio?.pause();
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = null;
  setPlaying(null);
}

/** Plays like Minecraft does: volume capped at 1, pitch 0.5–2 by changing the playback speed. */
export async function playSound(bytes: Uint8Array, volume = 1, pitch = 1, id?: string): Promise<void> {
  stopSound();
  currentUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/ogg' }));
  if (!audio) {
    audio = new Audio();
    audio.addEventListener('ended', () => setPlaying(null));
  }
  audio.src = currentUrl;
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.preservesPitch = false;
  audio.playbackRate = Math.max(0.5, Math.min(2, pitch));
  setPlaying(id ?? null);
  try {
    await audio.play();
  } catch (e) {
    setPlaying(null);
    throw e;
  }
}

/** Whether the sound started under `id` is playing right now. */
export function useIsPlaying(id: string): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => playingId === id,
  );
}
