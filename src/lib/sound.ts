let audioCtx: AudioContext | null = null;
let muted = false;
let initialized = false;

const MUTE_KEY = "blackjack.muted";

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

function resume(): void {
  const c = ctx();
  if (c && c.state === "suspended") void c.resume();
}

export function initSound(): void {
  if (initialized) return;
  initialized = true;
  muted = localStorage.getItem(MUTE_KEY) === "1";
  // unlock the AudioContext on the first user gesture
  const unlock = () => {
    resume();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // ignore storage failures
  }
}

export function isMuted(): boolean {
  return muted;
}

function tone(
  c: AudioContext,
  type: OscillatorType,
  freq: number,
  start: number,
  duration: number,
  volume: number,
  endFreq?: number,
): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function play(fn: (c: AudioContext, now: number) => void): void {
  if (muted) return;
  resume();
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;
  fn(c, now);
}

/** A short papery card slap. */
export function playDeal(): void {
  play((c, t) => {
    const buffer = c.createBuffer(1, Math.floor(c.sampleRate * 0.09), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2200;
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(t);
  });
}

/** A soft ripple of shuffling cards. */
export function playShuffle(): void {
  play((c, t) => {
    for (let i = 0; i < 6; i++) {
      const dur = 0.05 + Math.random() * 0.04;
      const buffer = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * (1 - j / data.length);
      const src = c.createBufferSource();
      src.buffer = buffer;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.12, t + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + dur);
      const filter = c.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 900 + Math.random() * 1200;
      src.connect(filter).connect(gain).connect(c.destination);
      src.start(t + i * 0.09);
    }
  });
}

/** A bright two-note win chime. */
export function playWin(): void {
  play((c, t) => {
    tone(c, "sine", 880, t, 0.18, 0.2);
    tone(c, "sine", 1318, t + 0.12, 0.3, 0.2);
  });
}

/** A soft downward "no" blip for losses. */
export function playLose(): void {
  play((c, t) => {
    tone(c, "triangle", 330, t, 0.2, 0.12, 220);
  });
}

/** A quick chip-click. */
export function playChip(): void {
  play((c, t) => {
    tone(c, "square", 1200, t, 0.06, 0.06, 900);
  });
}
