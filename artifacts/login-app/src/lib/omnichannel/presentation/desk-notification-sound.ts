/** Desk notification sound preference — presentation only. */
export const DESK_SOUND_STORAGE_KEY = "desk.notifications.sound";

const PREFS_EVENT = "desk:preferences-changed";

export function isDeskSoundEnabled(): boolean {
  try {
    const raw = localStorage.getItem(DESK_SOUND_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

export function setDeskSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(DESK_SOUND_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: { sound: enabled } }));
}

export function toggleDeskSoundEnabled(): boolean {
  const next = !isDeskSoundEnabled();
  setDeskSoundEnabled(next);
  return next;
}

export function subscribeDeskPreferences(listener: () => void): () => void {
  const onPrefs = () => listener();
  const onStorage = (event: StorageEvent) => {
    if (event.key === DESK_SOUND_STORAGE_KEY) listener();
  };
  window.addEventListener(PREFS_EVENT, onPrefs);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PREFS_EVENT, onPrefs);
    window.removeEventListener("storage", onStorage);
  };
}

let sharedCtx: AudioContext | null = null;
let lastPlayAt = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx) sharedCtx = new Ctx();
  return sharedCtx;
}

/** Short, soft two-tone chime — not loud, not looping. */
export function playDeskNotificationSound(): void {
  if (!isDeskSoundEnabled()) return;
  const now = Date.now();
  if (now - lastPlayAt < 600) return;
  lastPlayAt = now;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    void ctx.resume();

    const playTone = (frequency: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const t0 = ctx.currentTime + startOffset;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    };

    playTone(880, 0, 0.16);
    playTone(1174.7, 0.12, 0.18);
  } catch {
    /* autoplay / unsupported — silent fail */
  }
}
