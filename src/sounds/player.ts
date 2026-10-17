let audio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export function stopSound() {
  audio?.pause();
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = null;
}

export async function playSound(bytes: Uint8Array, volume = 1): Promise<void> {
  stopSound();
  currentUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/ogg' }));
  audio ??= new Audio();
  audio.src = currentUrl;
  audio.volume = Math.max(0, Math.min(1, volume));
  await audio.play();
}
