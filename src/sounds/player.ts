let audio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export function stopSound() {
  audio?.pause();
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = null;
}

/** Plays like Minecraft does: volume capped at 1, pitch 0.5–2 by changing the playback speed. */
export async function playSound(bytes: Uint8Array, volume = 1, pitch = 1): Promise<void> {
  stopSound();
  currentUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/ogg' }));
  audio ??= new Audio();
  audio.src = currentUrl;
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.preservesPitch = false;
  audio.playbackRate = Math.max(0.5, Math.min(2, pitch));
  await audio.play();
}
