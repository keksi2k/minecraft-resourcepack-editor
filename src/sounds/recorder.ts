import { t } from '../i18n';

/** A running microphone recording. */
export interface Recording {
  /** Current input peak (0–1), for a level meter. */
  level(): number;
  /** Ends the recording and returns the recorded file (webm/ogg, as the browser records it). */
  stop(): Promise<Uint8Array>;
  /** Ends the recording and throws it away. */
  cancel(): void;
}

/** Starts recording from the microphone (asks for permission the first time). */
export async function startRecording(): Promise<Recording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error(t('editor.sound.micInsecure'));
  let stream: MediaStream;
  try {
    // raw input: echo cancellation and auto gain would change the sound being recorded
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } });
  } catch (e) {
    throw new Error(t('editor.sound.micDenied', { error: (e as Error).message }));
  }
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const ac = new AudioContext();
  const analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  ac.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const release = () => {
    stream.getTracks().forEach((tr) => tr.stop());
    void ac.close();
  };
  rec.start();
  return {
    level() {
      analyser.getFloatTimeDomainData(buf);
      let m = 0;
      for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
      return m;
    },
    stop: () =>
      new Promise((resolve, reject) => {
        rec.onstop = async () => {
          release();
          resolve(new Uint8Array(await new Blob(chunks, { type: rec.mimeType }).arrayBuffer()));
        };
        rec.onerror = (e) => {
          release();
          reject(new Error(String((e as ErrorEvent).message ?? e)));
        };
        rec.stop();
      }),
    cancel() {
      rec.onstop = null;
      if (rec.state !== 'inactive') rec.stop();
      release();
    },
  };
}
