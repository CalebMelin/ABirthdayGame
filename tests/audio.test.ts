import { describe, expect, it } from 'vitest';
import {
  noteToFrequency,
  adsrGain,
  speedToEnginePitch,
  getAudio,
  installAudioUnlock,
} from '../src/systems/audio';

// This whole suite runs in plain Node (no DOM, no AudioContext) — importing
// audio.ts must be side-effect-free, and getAudio()/installAudioUnlock() must be
// safe no-ops. That is the import-safety contract the ST-7a engine promises.

describe('noteToFrequency', () => {
  it('maps A4 to exactly 440 Hz', () => {
    expect(noteToFrequency('A4')).toBeCloseTo(440, 6);
  });

  it('maps middle C (C4) to ~261.63 Hz', () => {
    expect(noteToFrequency('C4')).toBeCloseTo(261.6256, 3);
  });

  it('an octave up doubles the frequency (A5 = 880)', () => {
    expect(noteToFrequency('A5')).toBeCloseTo(880, 6);
  });

  it('an octave down halves the frequency (A3 = 220)', () => {
    expect(noteToFrequency('A3')).toBeCloseTo(220, 6);
  });

  it('handles sharps and their enharmonic flats equally (C#4 == Db4)', () => {
    expect(noteToFrequency('C#4')).toBeCloseTo(noteToFrequency('Db4'), 6);
    expect(noteToFrequency('C#4')).toBeCloseTo(277.1826, 3);
  });

  it('is case-insensitive on the letter', () => {
    expect(noteToFrequency('a4')).toBeCloseTo(440, 6);
  });

  it('returns 0 for an unparseable string or a rest (caller treats 0 as silence)', () => {
    expect(noteToFrequency('rest')).toBe(0);
    expect(noteToFrequency('')).toBe(0);
    expect(noteToFrequency('H4')).toBe(0);
    expect(noteToFrequency('A')).toBe(0);
  });
});

describe('adsrGain', () => {
  const env = { attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.1 };
  const gate = 0.5;

  it('is 0 at or before t=0', () => {
    expect(adsrGain(0, gate, env)).toBe(0);
    expect(adsrGain(-1, gate, env)).toBe(0);
  });

  it('ramps up through the attack phase, peaking at the end of attack', () => {
    expect(adsrGain(0.05, gate, env)).toBeCloseTo(0.5, 6); // halfway up
    expect(adsrGain(0.1, gate, env)).toBeCloseTo(1, 6); // peak
  });

  it('decays from peak to the sustain level', () => {
    expect(adsrGain(0.15, gate, env)).toBeCloseTo(0.75, 6); // halfway peak->sustain
    expect(adsrGain(0.2, gate, env)).toBeCloseTo(0.5, 6); // sustain level
  });

  it('holds the sustain level until the gate closes', () => {
    expect(adsrGain(0.35, gate, env)).toBeCloseTo(0.5, 6);
    expect(adsrGain(0.49, gate, env)).toBeCloseTo(0.5, 6);
  });

  it('releases from the sustain level to 0 after the gate closes', () => {
    expect(adsrGain(0.55, gate, env)).toBeCloseTo(0.25, 6); // halfway down
    expect(adsrGain(0.6, gate, env)).toBeCloseTo(0, 6);
  });

  it('is 0 once the release tail has fully elapsed', () => {
    expect(adsrGain(1, gate, env)).toBe(0);
  });

  it('scales with the peak argument', () => {
    expect(adsrGain(0.1, gate, env, 0.2)).toBeCloseTo(0.2, 6);
    expect(adsrGain(0.2, gate, env, 0.2)).toBeCloseTo(0.1, 6); // sustain*peak
  });

  it('never divides by zero on a zero-length attack/decay/release', () => {
    const instant = { attack: 0, decay: 0, sustain: 0.5, release: 0 };
    expect(adsrGain(0.01, 0.2, instant)).toBeCloseTo(0.5, 6); // straight to sustain
    expect(adsrGain(0.25, 0.2, instant)).toBe(0); // no release tail
  });
});

describe('speedToEnginePitch', () => {
  it('returns the idle pitch at a standstill', () => {
    expect(speedToEnginePitch(0, { idleHz: 70, maxHz: 190, maxSpeed: 10 })).toBe(70);
  });

  it('returns the max pitch at/above the reference top speed', () => {
    expect(speedToEnginePitch(10, { idleHz: 70, maxHz: 190, maxSpeed: 10 })).toBe(190);
    expect(speedToEnginePitch(50, { idleHz: 70, maxHz: 190, maxSpeed: 10 })).toBe(190);
  });

  it('interpolates linearly in between', () => {
    expect(speedToEnginePitch(5, { idleHz: 70, maxHz: 190, maxSpeed: 10 })).toBeCloseTo(130, 6);
  });

  it('treats non-finite / negative (reverse) speed as idle', () => {
    const p = { idleHz: 70, maxHz: 190, maxSpeed: 10 };
    expect(speedToEnginePitch(Number.NaN, p)).toBe(70);
    expect(speedToEnginePitch(Number.POSITIVE_INFINITY, p)).toBe(70);
    expect(speedToEnginePitch(-5, p)).toBe(70); // floored at 0 -> idle
  });

  it('uses defaults when no params are given (idle at 0, monotonic upward)', () => {
    const idle = speedToEnginePitch(0);
    const fast = speedToEnginePitch(11);
    expect(fast).toBeGreaterThan(idle);
  });
});

describe('import-safety under Node (no DOM / no AudioContext)', () => {
  it('getAudio() returns a stable singleton that never throws and reports unavailable', () => {
    const audio = getAudio();
    expect(getAudio()).toBe(audio);
    expect(audio.isAvailable()).toBe(false); // no AudioContext in Node
    // Every method is a safe no-op — none may throw.
    expect(() => audio.ensureStarted()).not.toThrow();
    expect(() => audio.playMusic('title')).not.toThrow();
    expect(() => audio.stopMusic()).not.toThrow();
    expect(() => audio.playSfx('click')).not.toThrow();
    expect(() => audio.setMuted(true)).not.toThrow();
    expect(audio.isMuted()).toBe(true);
    expect(() => audio.setMuted(false)).not.toThrow();
    expect(audio.isMuted()).toBe(false);
  });

  it('installAudioUnlock() is a safe no-op with no window', () => {
    expect(() => installAudioUnlock()).not.toThrow();
  });
});
