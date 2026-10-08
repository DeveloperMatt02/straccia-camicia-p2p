// Suoni sintetizzati al volo (nessun file da scaricare) e vibrazione.
let ctx = null;
let enabled = true, vibrateOn = true;

export function setSound(on) { enabled = on; }
export function setVibrate(on) { vibrateOn = on; }

// I browser permettono l'audio solo dopo un tocco: lo sblocco al primo gesto.
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function noise(dur) {
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function burst({ freq = 1800, q = 0.9, dur = 0.07, gain = 0.5, type = 'bandpass', sweepTo = null, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const src = noise(dur + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t); src.stop(t + dur + 0.05);
}

function tone({ freq, dur = 0.12, gain = 0.18, type = 'triangle', delay = 0, slide = null }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function vib(p) { if (vibrateOn && navigator.vibrate) try { navigator.vibrate(p); } catch {} }

const SOUNDS = {
  card() { burst({ freq: 2200, q: 0.7, dur: 0.05, gain: 0.45 }); tone({ freq: 140, dur: 0.06, gain: 0.25, type: 'sine', slide: 70 }); },
  pay() { burst({ freq: 2600, q: 0.8, dur: 0.06, gain: 0.5 }); tone({ freq: 660, dur: 0.09, gain: 0.12, delay: 0.03 }); tone({ freq: 880, dur: 0.12, gain: 0.12, delay: 0.11 }); },
  collect() { burst({ freq: 400, sweepTo: 3200, q: 0.6, dur: 0.32, gain: 0.35 }); },
  slap() { tone({ freq: 110, dur: 0.16, gain: 0.6, type: 'sine', slide: 45 }); burst({ freq: 900, q: 0.5, dur: 0.12, gain: 0.8, type: 'lowpass' }); },
  wrong() { tone({ freq: 180, dur: 0.22, gain: 0.16, type: 'sawtooth', slide: 120 }); },
  turn() { tone({ freq: 990, dur: 0.07, gain: 0.07, type: 'sine' }); },
  out() { tone({ freq: 392, dur: 0.18, gain: 0.12, delay: 0 }); tone({ freq: 294, dur: 0.3, gain: 0.12, delay: 0.16 }); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.22, gain: 0.14, delay: i * 0.11 })); },
  lose() { [392, 349, 311, 262].forEach((f, i) => tone({ freq: f, dur: 0.28, gain: 0.12, delay: i * 0.16, type: 'sine' })); },
  pop() { tone({ freq: 700, dur: 0.06, gain: 0.08, type: 'sine', slide: 1100 }); },
};

const VIBES = { card: 12, pay: [20, 40, 20], collect: 40, slap: 70, wrong: [60, 40, 60], win: [80, 60, 120], lose: 200, turn: 15 };

export function sfx(name) {
  if (enabled && ctx && ctx.state === 'running' && SOUNDS[name]) try { SOUNDS[name](); } catch {}
  if (VIBES[name] != null) vib(VIBES[name]);
}
