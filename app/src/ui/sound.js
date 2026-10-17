// D5 – Alarmton per Web Audio (kein Audio-Datei nötig). Lautstärke aus den Einstellungen.
import { settings } from "../core/settings.js";

let ctx = null;
let loop = null;

function beep(at, freq, dur, gain) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "square"; o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.01);
  g.gain.setValueAtTime(gain, at + dur - 0.02);
  g.gain.linearRampToValueAtTime(0, at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(at); o.stop(at + dur);
}

/** Zweiklang wie ein Melder, einmal oder für `ms` Millisekunden. */
export function playAlarmTone(ms = 1200) {
  try {
    ctx ||= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    const vol = Math.max(0.02, (settings().pc.volume / 100) * 0.35);
    const t = ctx.currentTime;
    for (let i = 0; i * 0.6 < ms / 1000; i++) {
      beep(t + i * 0.6, 880, 0.28, vol);
      beep(t + i * 0.6 + 0.3, 660, 0.28, vol);
    }
  } catch { /* Ton ist Komfort */ }
}

export function startAlarmLoop() {
  stopAlarmLoop();
  playAlarmTone(1800);
  loop = setInterval(() => playAlarmTone(1800), 3000);
}

export function stopAlarmLoop() {
  clearInterval(loop);
  loop = null;
}
