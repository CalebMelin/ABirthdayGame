// Runtime-synthesized audio engine (PLAN-10 ST-7a — the ENGINE + persistence).
//
// NORTH_STAR §3 says "game must work fine muted"; CLAUDE.md Rule 4 forbids
// license-unknown assets. This module satisfies both by SYNTHESIZING every
// sound at runtime with the Web Audio API — no committed audio binaries, no npm
// deps, everything project-owned / CC0 (see CREDITS-ASSETS.md, DECISIONS.md
// 2026-07-24). ST-7b fills in the full music tracks + all SFX; ST-7a ships the
// engine, the mute/persistence infrastructure, and a small PROOF (a soft button
// click + a gentle title-music loop).
//
// IMPORT-SAFETY (critical): Vitest runs in plain Node with no DOM globals, so a
// bare `new AudioContext()` at import time would crash the whole test suite.
// Nothing here touches `AudioContext` / `window` at module-eval — the context is
// created LAZILY inside ensureStarted(), guarded on `typeof window`. If audio is
// unavailable (Node, or a browser without Web Audio) every method is a safe
// no-op. This file imports NO Phaser and NO browser globals at eval, so the pure
// helpers below (noteToFrequency / adsrGain / speedToEnginePitch) unit-test in
// Node exactly like save.ts's derivations.
//
// EVERY Web Audio call is wrapped so a suspended / unavailable / failed context
// can NEVER throw: the game's playtest harnesses gate their exit code on ZERO
// console errors in headless Chrome, and audio must add none.

import { getSave } from './save';

// ---------------------------------------------------------------------------
// Tunable audio numbers. Kept as a local documented block (CLAUDE.md allows
// this for audio rather than bloating constants.ts) — no magic numbers buried
// in scene code. Everything is deliberately GENTLE: soft waveforms, low gains,
// no harsh frequencies. For a GIFT, annoying audio is worse than silence.
// ---------------------------------------------------------------------------

const AUDIO = {
  /** Reference pitch for note-name -> frequency (A4 = 440 Hz). */
  a4Hz: 440,
  /** Master bus gain when UNMUTED (0..1). Low headroom — the game is quiet and
   * pleasant, never loud. Muted drives this to 0. */
  masterVolume: 0.5,
  /** Music sub-bus gain relative to master — music sits UNDER the SFX. */
  musicVolume: 0.32,
  /** Seconds over which master gain eases to/from 0 on mute/unmute, so toggling
   * never clicks. `setTargetAtTime` time-constant. */
  muteRampSec: 0.02,
  /** Default note envelope (seconds / sustain 0..1), a soft pluck: quick
   * attack, gentle decay to a low sustain, short release. Shared by SFX + music
   * notes; adsrGain() below is the pure, Node-testable model of this shape. */
  env: { attack: 0.008, decay: 0.06, sustain: 0.5, release: 0.08 },
  /** Music scheduler: how far ahead (s) notes are queued, and how often (ms) the
   * lookahead ticker runs. A classic Web-Audio lookahead scheduler — robust to
   * a suspended context (it simply schedules nothing until the context runs). */
  scheduleAheadSec: 0.35,
  schedulerIntervalMs: 120,
  /** Music fade-out (s / matching ms) applied on stopMusic so leaving a scene
   * never cuts the loop off with a click. */
  musicFadeSec: 0.12,
  musicFadeMs: 400,
  // ------- speed -> engine pitch mapping (exported pure helper; wired in ST-7b)
  /** Engine oscillator pitch (Hz) at a standstill. */
  engineIdleHz: 70,
  /** Engine oscillator pitch (Hz) at the reference top speed. */
  engineMaxHz: 190,
  /** Bike speed (px/step) treated as "full throttle" for the pitch ramp — the
   * bike's driven flat top speed (BIKE_TUNING.maxWheelAngularVelocity * wheelRadius
   * = 0.6 * 18 = 10.8). Kept as a plain literal so this module imports no
   * gameplay constants (stays a leaf). */
  engineMaxSpeed: 10.8,
  // ------- continuous ENGINE tone (ST-7b) ------------------------------------
  /** Engine hum waveform — triangle, deliberately the softest of the shaped
   * waveforms (a sawtooth at this low pitch buzzes). */
  engineWaveform: 'triangle' as OscillatorType,
  /** Engine hum PEAK gain (into the continuous bus). LOW on purpose — a subtle
   * hum UNDER the SFX, never a scream (NORTH_STAR: this is a gift). */
  engineGain: 0.09,
  /** Time-constant (s) for the engine frequency glide (setTargetAtTime) as speed
   * changes, so retuning never zippers/steps. */
  enginePitchGlideSec: 0.08,
  /** Time-constant (s) for the engine gain easing on (driving on the ground) /
   * off (airborne, stopped, or the run ended), so it fades rather than clicks. */
  engineGainGlideSec: 0.06,
  /** Fade-out (s) applied to the engine gain when stopEngine tears it down, plus
   * the extra tail (s) before the oscillator actually stops — long enough to let
   * the fade complete so shutdown never clicks, short enough to be gone promptly
   * (no leaked oscillator across a scene change — the #1 continuous-sound risk). */
  engineStopFadeSec: 0.03,
  engineStopTailSec: 0.06,
  // ------- continuous police SIREN (ST-7b, level 15) -------------------------
  /** Siren main-tone waveform — sine, the gentlest option (a cute wail, not a
   * blaring square). */
  sirenWaveform: 'sine' as OscillatorType,
  /** Siren PEAK gain (into the continuous bus) — gentle, still cute. */
  sirenGain: 0.06,
  /** The two tones (Hz) the siren wavers between and the LFO period (s) of one
   * full low->high->low sweep. Implemented as a slow SINE LFO on the main
   * oscillator's frequency (a smooth two-tone waver), not a hard square
   * alternation — softer, per the gentle mandate. */
  sirenLowHz: 440,
  sirenHighHz: 620,
  sirenSweepSec: 0.9,
  /** Fade (s) the siren gain uses easing in on start / out on stop, so it never
   * clicks in or out; plus the tail (s) before its oscillators stop. */
  sirenGainGlideSec: 0.05,
  sirenStopTailSec: 0.08,
  // ------- shared CONTINUOUS bus (engine + siren) ----------------------------
  /** Ramp (s) the continuous bus uses to duck to 0 on pause and back on resume,
   * so pausing mid-drive silences the hum/siren without a click and resuming
   * brings it back. Engine + siren both route through this one bus so a single
   * duck covers both. */
  continuousPauseRampSec: 0.03,
} as const;

/** Speed gates (px per physics step, in BikeHandle.speed units) for the drive
 * SFX, exported so GameScene references NAMED tunables rather than burying magic
 * numbers in scene code (CLAUDE.md). Kept beside the AUDIO block since they are
 * audio-only thresholds. */
export const DRIVE_SFX = {
  /** The bike must be moving at least this fast at takeoff for a jump/land SFX
   * to fire — filters the near-zero-speed spawn-settle hop and ramp-crest
   * chatter, so jump/land only sound on a real launch off a ramp. */
  jumpMinSpeedPxPerStep: 2.5,
  /** The engine hum stays audible while coasting at least this fast even off the
   * gas; below it (stopped and not gassing) the hum fades out. */
  engineMinSpeedPxPerStep: 0.5,
} as const;

// ---------------------------------------------------------------------------
// PURE helpers (no DOM, no Web Audio) — exported so they unit-test in Node.
// ---------------------------------------------------------------------------

const NOTE_SEMITONES: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * Note name (e.g. `"A4"`, `"C#5"`, `"Gb3"`) -> frequency in Hz, using
 * equal temperament with A4 = AUDIO.a4Hz. Returns 0 for an unparseable string
 * or an explicit `"rest"` — callers treat 0 as "play nothing", so a rest is
 * just a gap. Pure and total (never throws), so it is Node-unit-testable and
 * safe to call while scheduling.
 */
export function noteToFrequency(note: string): number {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note.trim());
  if (!match) return 0;
  const letter = match[1].toUpperCase();
  const semitone = NOTE_SEMITONES[letter];
  if (semitone === undefined) return 0;
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const octave = Number.parseInt(match[3], 10);
  // Distance in semitones from A4 (letter A, octave 4).
  const semitonesFromA4 = semitone + accidental - 9 + (octave - 4) * 12;
  return AUDIO.a4Hz * Math.pow(2, semitonesFromA4 / 12);
}

/** ADSR envelope parameters (seconds, except `sustain` = level 0..1). */
export interface AdsrParams {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/**
 * Sampled ADSR envelope gain at `elapsed` seconds for a note gated ON for
 * `gateSec` seconds then released, scaled to `peak`. This is the PURE model of
 * the Web-Audio ramp scheduleNote() applies, exported so the envelope math is
 * Node-testable (attack ramp, decay to sustain, sustain hold, release to 0,
 * silence before 0 and after the tail). Total: clamps/guards degenerate inputs
 * (negative or zero phase lengths) instead of throwing or dividing by zero.
 */
export function adsrGain(
  elapsed: number,
  gateSec: number,
  params: AdsrParams,
  peak = 1
): number {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  const attack = Math.max(0, params.attack);
  const decay = Math.max(0, params.decay);
  const release = Math.max(0, params.release);
  const sustain = Math.min(1, Math.max(0, params.sustain));
  const gate = Math.max(0, gateSec);
  const sustainLevel = peak * sustain;

  if (elapsed >= gate + release) return 0;
  if (elapsed >= gate) {
    // Release phase: ramp from the sustain level down to 0.
    if (release === 0) return 0;
    const t = (elapsed - gate) / release;
    return sustainLevel * (1 - t);
  }
  if (elapsed < attack) {
    // Attack phase: ramp 0 -> peak.
    return attack === 0 ? peak : peak * (elapsed / attack);
  }
  if (elapsed < attack + decay) {
    // Decay phase: ramp peak -> sustain level.
    if (decay === 0) return sustainLevel;
    const t = (elapsed - attack) / decay;
    return peak + (sustainLevel - peak) * t;
  }
  // Sustain phase.
  return sustainLevel;
}

/**
 * Bike speed (px/step, BikeHandle.speed units) -> engine oscillator frequency
 * (Hz), a linear ramp from idle to max clamped at the reference top speed. Pure
 * and total: non-finite / negative speed reads as idle. Exported for ST-7b's
 * engine-rev SFX + its Node tests; not wired into gameplay in ST-7a.
 */
export function speedToEnginePitch(
  speed: number,
  params?: { idleHz?: number; maxHz?: number; maxSpeed?: number }
): number {
  const idle = params?.idleHz ?? AUDIO.engineIdleHz;
  const max = params?.maxHz ?? AUDIO.engineMaxHz;
  const maxSpeed = params?.maxSpeed ?? AUDIO.engineMaxSpeed;
  // Floor at 0: non-finite or negative (reverse-creep) speed reads as idle.
  const s = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const t = maxSpeed > 0 ? Math.min(1, s / maxSpeed) : 0;
  return idle + (max - idle) * t;
}

// ---------------------------------------------------------------------------
// Sound + music definitions (data; ST-7b extends these tables).
// ---------------------------------------------------------------------------

/** One scheduled tone within an SFX. `at` = seconds after the trigger. */
interface SfxNote {
  note: string;
  at: number;
  dur: number;
}

interface SfxSpec {
  waveform: OscillatorType;
  gain: number;
  notes: readonly SfxNote[];
}

/** The one-shot SFX table. ST-7a shipped `click` (the menu-button blip) as the
 * proof that gesture -> resume -> schedule -> master-gain -> mute works end to
 * end; ST-7b fills in the rest. All are SHORT, SOFT, low-gain (a gift — harsh
 * audio is worse than silence): the continuous engine + siren are NOT here (they
 * are sustained oscillators managed separately, see startEngine/startSiren). */
const SFX_SPECS = {
  click: {
    waveform: 'triangle',
    gain: 0.16,
    notes: [{ note: 'A5', at: 0, dur: 0.05 }],
  },
  // A soft brake chirp: a quick downward two-note skid.
  brake: {
    waveform: 'triangle',
    gain: 0.11,
    notes: [
      { note: 'A4', at: 0, dur: 0.04 },
      { note: 'E4', at: 0.04, dur: 0.08 },
    ],
  },
  // A quick upward "boing" as the bike leaves a ramp.
  jump: {
    waveform: 'triangle',
    gain: 0.13,
    notes: [
      { note: 'C5', at: 0, dur: 0.05 },
      { note: 'G5', at: 0.05, dur: 0.07 },
    ],
  },
  // A soft low thud on touchdown.
  land: {
    waveform: 'sine',
    gain: 0.18,
    notes: [{ note: 'G2', at: 0, dur: 0.1 }],
  },
  // A little rising sparkle when a trick awards a tulip.
  tulip: {
    waveform: 'sine',
    gain: 0.12,
    notes: [
      { note: 'C6', at: 0, dur: 0.05 },
      { note: 'E6', at: 0.05, dur: 0.05 },
      { note: 'G6', at: 0.1, dur: 0.09 },
    ],
  },
  // A soft "fwip" as an oncoming car passes (level 7). A short low descending
  // pair — an oscillator can't make noise, so this reads as a gentle swish.
  whoosh: {
    waveform: 'triangle',
    gain: 0.1,
    notes: [
      { note: 'A3', at: 0, dur: 0.05 },
      { note: 'E3', at: 0.05, dur: 0.11 },
    ],
  },
  // A cute, very short balloon pop.
  pop: {
    waveform: 'triangle',
    gain: 0.16,
    notes: [
      { note: 'A5', at: 0, dur: 0.03 },
      { note: 'A4', at: 0.02, dur: 0.05 },
    ],
  },
  // A happy little ascending fanfare on the level-complete screen.
  complete: {
    waveform: 'triangle',
    gain: 0.15,
    notes: [
      { note: 'C5', at: 0, dur: 0.12 },
      { note: 'E5', at: 0.12, dur: 0.12 },
      { note: 'G5', at: 0.24, dur: 0.12 },
      { note: 'C6', at: 0.36, dur: 0.28 },
    ],
  },
  // A GENTLE fail "womp" — a soft minor-third down. Never harsh; matches the
  // never-mock-the-player tone (NORTH_STAR §7).
  fail: {
    waveform: 'sine',
    gain: 0.16,
    notes: [
      { note: 'G4', at: 0, dur: 0.14 },
      { note: 'D4', at: 0.16, dur: 0.32 },
    ],
  },
  // A warm swell as the party venue's doors open (level 22 arrival) — the
  // "door-creak / music-swell" beat, drawn as a soft major chord bloom.
  door: {
    waveform: 'sine',
    gain: 0.13,
    notes: [
      { note: 'C4', at: 0, dur: 0.42 },
      { note: 'E4', at: 0.03, dur: 0.42 },
      { note: 'G4', at: 0.06, dur: 0.42 },
    ],
  },
} as const satisfies Record<string, SfxSpec>;

export type SfxId = keyof typeof SFX_SPECS;

/** Options for {@link AudioManager.playSfx}. */
export interface SfxOptions {
  /** Override the SFX's default peak gain (0..1). */
  gain?: number;
}

/** One melody note in a music loop. `beat`/`dur` are in beats. */
interface MelodyNote {
  note: string;
  beat: number;
  dur: number;
  gain?: number;
}

interface MusicTrack {
  bpm: number;
  /** Total loop length in beats — the scheduler lays down a fresh copy every
   * `loopSec` (= beats * 60/bpm). */
  beats: number;
  waveform: OscillatorType;
  noteGain: number;
  notes: readonly MelodyNote[];
}

// Every loop below is a GENTLE chiptune phrase: soft waveforms (sine / triangle),
// low note gains, mid/low registers, nothing harsh — a GIFT, where annoying
// audio is worse than silence. Each is a note-sequence + tempo the existing
// lookahead scheduler lays down every loopSec (= beats * 60/bpm).

/** TITLE / MENU — a warm, welcoming phrase in C major over a soft low anchor.
 * Refined from ST-7a's proof loop into a fuller top line. Reused (ST-7b) by the
 * Level Select, Character Creation and Level Complete menus so the whole shell
 * shares one cohesive theme. */
const TITLE_NOTES: readonly MelodyNote[] = [
  { note: 'G4', beat: 0, dur: 1 },
  { note: 'C5', beat: 1, dur: 1 },
  { note: 'E5', beat: 2, dur: 1 },
  { note: 'D5', beat: 3, dur: 1 },
  { note: 'C5', beat: 4, dur: 1 },
  { note: 'A4', beat: 5, dur: 1 },
  { note: 'G4', beat: 6, dur: 2 },
  // a soft low anchor under the phrase
  { note: 'C3', beat: 0, dur: 4, gain: 0.45 },
  { note: 'G3', beat: 4, dur: 2, gain: 0.45 },
  { note: 'C3', beat: 6, dur: 2, gain: 0.45 },
];

/** RIDING — a light, bouncy, happy driving loop in C major (I-V-vi-IV feel): a
 * plucky on-the-beat bass under a cheerful melody. The normal-level track. */
const RIDING_NOTES: readonly MelodyNote[] = [
  // bouncy bass
  { note: 'C3', beat: 0, dur: 0.5, gain: 0.5 },
  { note: 'C3', beat: 1, dur: 0.5, gain: 0.5 },
  { note: 'G3', beat: 2, dur: 0.5, gain: 0.5 },
  { note: 'G3', beat: 3, dur: 0.5, gain: 0.5 },
  { note: 'A3', beat: 4, dur: 0.5, gain: 0.5 },
  { note: 'A3', beat: 5, dur: 0.5, gain: 0.5 },
  { note: 'F3', beat: 6, dur: 0.5, gain: 0.5 },
  { note: 'G3', beat: 7, dur: 0.5, gain: 0.5 },
  // light melody on top
  { note: 'E4', beat: 0, dur: 0.5 },
  { note: 'G4', beat: 0.5, dur: 0.5 },
  { note: 'C5', beat: 1, dur: 1 },
  { note: 'B4', beat: 2, dur: 0.5 },
  { note: 'G4', beat: 2.5, dur: 0.5 },
  { note: 'A4', beat: 3, dur: 1 },
  { note: 'C5', beat: 4, dur: 0.5 },
  { note: 'A4', beat: 4.5, dur: 0.5 },
  { note: 'F4', beat: 5, dur: 1 },
  { note: 'E4', beat: 6, dur: 0.5 },
  { note: 'G4', beat: 6.5, dur: 0.5 },
  { note: 'C5', beat: 7, dur: 1 },
];

/** POLICE (level 15) — tense but still cute: a driving eighth-note A-minor bass
 * ostinato under a two-tone "siren" melody motif. Faster + minor for urgency,
 * but soft triangle and low-gain so it never grates. */
const POLICE_NOTES: readonly MelodyNote[] = [
  // driving bass ostinato (A minor)
  { note: 'A2', beat: 0, dur: 0.5, gain: 0.5 },
  { note: 'A2', beat: 0.5, dur: 0.5, gain: 0.5 },
  { note: 'A2', beat: 1, dur: 0.5, gain: 0.5 },
  { note: 'A2', beat: 1.5, dur: 0.5, gain: 0.5 },
  { note: 'F2', beat: 2, dur: 0.5, gain: 0.5 },
  { note: 'F2', beat: 2.5, dur: 0.5, gain: 0.5 },
  { note: 'F2', beat: 3, dur: 0.5, gain: 0.5 },
  { note: 'F2', beat: 3.5, dur: 0.5, gain: 0.5 },
  { note: 'G2', beat: 4, dur: 0.5, gain: 0.5 },
  { note: 'G2', beat: 4.5, dur: 0.5, gain: 0.5 },
  { note: 'G2', beat: 5, dur: 0.5, gain: 0.5 },
  { note: 'G2', beat: 5.5, dur: 0.5, gain: 0.5 },
  { note: 'E2', beat: 6, dur: 0.5, gain: 0.5 },
  { note: 'E2', beat: 6.5, dur: 0.5, gain: 0.5 },
  { note: 'E2', beat: 7, dur: 0.5, gain: 0.5 },
  { note: 'E2', beat: 7.5, dur: 0.5, gain: 0.5 },
  // two-tone siren motif on top
  { note: 'E5', beat: 0, dur: 0.75 },
  { note: 'A4', beat: 1, dur: 0.75 },
  { note: 'E5', beat: 2, dur: 0.75 },
  { note: 'A4', beat: 3, dur: 0.75 },
  { note: 'F5', beat: 4, dur: 0.75 },
  { note: 'C5', beat: 5, dur: 0.75 },
  { note: 'E5', beat: 6, dur: 0.75 },
  { note: 'B4', beat: 7, dur: 0.75 },
];

/** PARTY — celebratory C major: a bouncy bass under bright arpeggios. */
const PARTY_NOTES: readonly MelodyNote[] = [
  // bass
  { note: 'C3', beat: 0, dur: 0.5, gain: 0.5 },
  { note: 'G3', beat: 1, dur: 0.5, gain: 0.5 },
  { note: 'F3', beat: 2, dur: 0.5, gain: 0.5 },
  { note: 'G3', beat: 3, dur: 0.5, gain: 0.5 },
  { note: 'C3', beat: 4, dur: 0.5, gain: 0.5 },
  { note: 'G3', beat: 5, dur: 0.5, gain: 0.5 },
  { note: 'A3', beat: 6, dur: 0.5, gain: 0.5 },
  { note: 'G3', beat: 7, dur: 0.5, gain: 0.5 },
  // bright arpeggio melody
  { note: 'C5', beat: 0, dur: 0.25 },
  { note: 'E5', beat: 0.5, dur: 0.25 },
  { note: 'G5', beat: 1, dur: 0.5 },
  { note: 'E5', beat: 1.5, dur: 0.5 },
  { note: 'F5', beat: 2, dur: 0.25 },
  { note: 'A5', beat: 2.5, dur: 0.25 },
  { note: 'G5', beat: 3, dur: 0.5 },
  { note: 'E5', beat: 3.5, dur: 0.5 },
  { note: 'C5', beat: 4, dur: 0.25 },
  { note: 'E5', beat: 4.5, dur: 0.25 },
  { note: 'G5', beat: 5, dur: 0.5 },
  { note: 'C6', beat: 5.5, dur: 0.5 },
  { note: 'A5', beat: 6, dur: 0.5 },
  { note: 'G5', beat: 6.5, dur: 0.5 },
  { note: 'C6', beat: 7, dur: 1 },
];

/** CREDITS — a warm, slow, tender closing theme in F major over a soft bass. */
const CREDITS_NOTES: readonly MelodyNote[] = [
  { note: 'A4', beat: 0, dur: 1.5 },
  { note: 'G4', beat: 1.5, dur: 0.5 },
  { note: 'F4', beat: 2, dur: 2 },
  { note: 'C5', beat: 4, dur: 1.5 },
  { note: 'A4', beat: 5.5, dur: 0.5 },
  { note: 'G4', beat: 6, dur: 2 },
  // soft low anchor
  { note: 'F3', beat: 0, dur: 4, gain: 0.45 },
  { note: 'C3', beat: 4, dur: 4, gain: 0.45 },
];

const MUSIC_TRACKS = {
  title: {
    bpm: 96,
    beats: 8,
    waveform: 'sine',
    noteGain: 0.5,
    notes: TITLE_NOTES,
  },
  riding: {
    bpm: 116,
    beats: 8,
    waveform: 'triangle',
    noteGain: 0.42,
    notes: RIDING_NOTES,
  },
  police: {
    bpm: 138,
    beats: 8,
    waveform: 'triangle',
    noteGain: 0.4,
    notes: POLICE_NOTES,
  },
  party: {
    bpm: 128,
    beats: 8,
    waveform: 'triangle',
    noteGain: 0.42,
    notes: PARTY_NOTES,
  },
  credits: {
    bpm: 76,
    beats: 8,
    waveform: 'sine',
    noteGain: 0.5,
    notes: CREDITS_NOTES,
  },
} as const satisfies Record<string, MusicTrack>;

export type MusicId = keyof typeof MUSIC_TRACKS;

// ---------------------------------------------------------------------------
// The manager.
// ---------------------------------------------------------------------------

/** Public audio API. ST-7a implements the plumbing + the small proof set; the
 * method surface is the seam ST-7b fills with the remaining tracks/SFX. */
export interface AudioManager {
  /** Create the AudioContext (once, lazily) and resume it. Safe to call any
   * number of times; a no-op when Web Audio is unavailable. Called by the
   * first-gesture unlock and defensively by play* methods (iOS re-suspends). */
  ensureStarted(): void;
  /** Whether a usable AudioContext exists (false in Node / unsupported). */
  isAvailable(): boolean;
  isMuted(): boolean;
  /** Set + PERSIST the muted flag (via getSave().setMuted). Muted = master gain
   * 0 (silent) but the game keeps running normally. */
  setMuted(muted: boolean): void;
  /** Start a looping music track (at most one at a time; crossfade-friendly —
   * switching tracks stops the previous). No-op if the same track is playing. */
  playMusic(trackId: MusicId): void;
  /** Fade out + stop the current music loop. */
  stopMusic(): void;
  /** Fire a one-shot sound effect. */
  playSfx(id: SfxId, opts?: SfxOptions): void;
  /** Start the CONTINUOUS engine hum — a single sustained oscillator whose pitch
   * updateEngine() retunes. Idempotent (replaces any running engine). MUST be
   * paired with stopEngine() on scene shutdown / restart / fail so no oscillator
   * ever leaks. No-op when Web Audio is unavailable. */
  startEngine(): void;
  /** Retune the engine hum: pitch tracks `speedPxPerStep` (via speedToEnginePitch,
   * glided so it never zippers), gain eases toward the engine level when `on`
   * (driving on the ground) else toward 0 (airborne / stopped / run ended). Cheap
   * to call every frame; a no-op if the engine isn't running. */
  updateEngine(speedPxPerStep: number, on: boolean): void;
  /** Fade out + stop the engine hum and release its oscillator. Safe to call
   * twice, and safe to call when no engine is running. */
  stopEngine(): void;
  /** Start the CONTINUOUS police siren — a gentle two-tone wail (level 15).
   * Idempotent. MUST be paired with stopSiren() so it can never leak. */
  startSiren(): void;
  /** Fade out + stop the siren and release its oscillators. Safe to call twice. */
  stopSiren(): void;
  /** Duck the shared continuous bus (engine + siren) to silence — used when the
   * game is paused so a sustained hum/siren doesn't drone under the pause menu.
   * The one-shot SFX + music are unaffected. */
  pauseContinuous(): void;
  /** Restore the continuous bus after pauseContinuous(). */
  resumeContinuous(): void;
}

interface ActiveMusic {
  trackId: MusicId;
  track: MusicTrack;
  bus: GainNode;
  /** Lookahead scheduler interval id (window.setInterval). */
  timer: number;
  /** ctx time at which the NEXT loop copy should start. */
  nextLoopStart: number;
}

class WebAudioManager implements AudioManager {
  private context: AudioContext | undefined;
  private masterGain: GainNode | undefined;
  private muted: boolean;
  private music: ActiveMusic | undefined;
  /** Shared sub-bus for the CONTINUOUS sounds (engine + siren), so a single
   * duck (pauseContinuous) silences both under the pause menu. Created lazily in
   * ensureStarted alongside the master. */
  private continuousBus: GainNode | undefined;
  /** The engine hum's sustained oscillator + its gain (undefined when stopped). */
  private engineOsc: OscillatorNode | undefined;
  private engineGainNode: GainNode | undefined;
  /** The siren's main oscillator, its frequency-modulating LFO + LFO depth gain,
   * and its output gain (all undefined when stopped). */
  private sirenOsc: OscillatorNode | undefined;
  private sirenLfo: OscillatorNode | undefined;
  private sirenLfoGain: GainNode | undefined;
  private sirenGainNode: GainNode | undefined;

  constructor() {
    // Initialize from persisted state. getSave() is import-safe (in-memory
    // fallback under Node) so this never touches the DOM.
    let persisted = false;
    try {
      persisted = getSave().getMuted();
    } catch {
      persisted = false;
    }
    this.muted = persisted;
  }

  isAvailable(): boolean {
    return this.context !== undefined && this.masterGain !== undefined;
  }

  isMuted(): boolean {
    return this.muted;
  }

  ensureStarted(): void {
    if (typeof window === 'undefined') return;
    if (!this.context) {
      try {
        // window.webkitAudioContext is a legacy vendor-prefixed fallback not in
        // the TS DOM lib — the cast is the minimal typing for it (not `any`).
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        const master = ctx.createGain();
        master.gain.value = this.muted ? 0 : AUDIO.masterVolume;
        master.connect(ctx.destination);
        // Shared continuous-sound sub-bus (engine + siren) under the master, at
        // full gain — pauseContinuous ducks it to 0. Music + one-shot SFX go
        // straight to the master and are unaffected by the pause duck.
        const continuous = ctx.createGain();
        continuous.gain.value = 1;
        continuous.connect(master);
        this.context = ctx;
        this.masterGain = master;
        this.continuousBus = continuous;
      } catch {
        this.context = undefined;
        this.masterGain = undefined;
        this.continuousBus = undefined;
        return;
      }
    }
    // Browsers start the context suspended until a user gesture; iOS also
    // re-suspends after backgrounding — so resume defensively every call.
    try {
      if (this.context.state === 'suspended') {
        void this.context.resume().catch(() => undefined);
      }
    } catch {
      // resume unavailable / threw — leave it; play* stays a silent no-op.
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      getSave().setMuted(muted);
    } catch {
      // persistence failure must be invisible (save.ts is already total).
    }
    const ctx = this.context;
    const master = this.masterGain;
    if (!ctx || !master) return;
    const target = muted ? 0 : AUDIO.masterVolume;
    try {
      master.gain.setTargetAtTime(target, ctx.currentTime, AUDIO.muteRampSec);
    } catch {
      try {
        master.gain.value = target;
      } catch {
        // give up silently — never throw.
      }
    }
  }

  playSfx(id: SfxId, opts?: SfxOptions): void {
    this.ensureStarted();
    const ctx = this.context;
    const master = this.masterGain;
    if (!ctx || !master) return;
    const spec = SFX_SPECS[id];
    if (!spec) return;
    try {
      const now = ctx.currentTime;
      const peak = opts?.gain ?? spec.gain;
      for (const n of spec.notes) {
        this.scheduleNote(n.note, now + n.at, n.dur, peak, spec.waveform, master);
      }
    } catch {
      // never throw from a play call.
    }
  }

  // ------------------------------------------------------------------ engine
  startEngine(): void {
    this.ensureStarted();
    const ctx = this.context;
    const bus = this.continuousBus;
    if (!ctx || !bus) return;
    // Replace any already-running engine (idempotent) and make sure the shared
    // bus isn't left ducked from a prior pause that never resumed (e.g. a
    // pause -> Restart, which shuts the scene down without a RESUME event).
    this.stopEngine();
    this.resumeContinuous();
    try {
      const osc = ctx.createOscillator();
      osc.type = AUDIO.engineWaveform;
      osc.frequency.setValueAtTime(speedToEnginePitch(0), ctx.currentTime);
      const g = ctx.createGain();
      g.gain.value = 0; // eased up by updateEngine so the start never clicks
      osc.connect(g);
      g.connect(bus);
      osc.start();
      this.engineOsc = osc;
      this.engineGainNode = g;
    } catch {
      this.engineOsc = undefined;
      this.engineGainNode = undefined;
    }
  }

  updateEngine(speedPxPerStep: number, on: boolean): void {
    const ctx = this.context;
    const osc = this.engineOsc;
    const g = this.engineGainNode;
    if (!ctx || !osc || !g) return;
    try {
      const now = ctx.currentTime;
      osc.frequency.setTargetAtTime(
        speedToEnginePitch(speedPxPerStep),
        now,
        AUDIO.enginePitchGlideSec
      );
      g.gain.setTargetAtTime(on ? AUDIO.engineGain : 0, now, AUDIO.engineGainGlideSec);
    } catch {
      // never throw from a per-frame update.
    }
  }

  stopEngine(): void {
    const osc = this.engineOsc;
    const g = this.engineGainNode;
    // Clear the refs FIRST so a concurrent startEngine() builds a fresh pair and
    // this teardown can only ever run against the pair it captured.
    this.engineOsc = undefined;
    this.engineGainNode = undefined;
    if (!osc) return;
    const ctx = this.context;
    try {
      if (ctx && g) {
        const now = ctx.currentTime;
        // Fade the gain out, then stop the oscillator just after the fade so the
        // teardown never clicks; disconnect on ended so nothing leaks.
        g.gain.setTargetAtTime(0, now, AUDIO.engineStopFadeSec);
        osc.stop(now + AUDIO.engineStopFadeSec + AUDIO.engineStopTailSec);
      } else {
        osc.stop();
      }
      osc.onended = (): void => {
        try {
          osc.disconnect();
          g?.disconnect();
        } catch {
          // ignore
        }
      };
    } catch {
      try {
        osc.disconnect();
        g?.disconnect();
      } catch {
        // ignore
      }
    }
  }

  // ------------------------------------------------------------------- siren
  startSiren(): void {
    this.ensureStarted();
    const ctx = this.context;
    const bus = this.continuousBus;
    if (!ctx || !bus) return;
    this.stopSiren(); // idempotent
    this.resumeContinuous();
    try {
      const now = ctx.currentTime;
      const centerHz = (AUDIO.sirenLowHz + AUDIO.sirenHighHz) / 2;
      const depthHz = (AUDIO.sirenHighHz - AUDIO.sirenLowHz) / 2;
      const osc = ctx.createOscillator();
      osc.type = AUDIO.sirenWaveform;
      osc.frequency.setValueAtTime(centerHz, now);
      // A slow SINE LFO on the main oscillator's frequency = a smooth two-tone
      // waver (gentler than a hard hi/lo square alternation).
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(1 / AUDIO.sirenSweepSec, now);
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = depthHz;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(bus);
      osc.start();
      lfo.start();
      g.gain.setTargetAtTime(AUDIO.sirenGain, now, AUDIO.sirenGainGlideSec);
      this.sirenOsc = osc;
      this.sirenLfo = lfo;
      this.sirenLfoGain = lfoGain;
      this.sirenGainNode = g;
    } catch {
      this.sirenOsc = undefined;
      this.sirenLfo = undefined;
      this.sirenLfoGain = undefined;
      this.sirenGainNode = undefined;
    }
  }

  stopSiren(): void {
    const osc = this.sirenOsc;
    const lfo = this.sirenLfo;
    const lfoGain = this.sirenLfoGain;
    const g = this.sirenGainNode;
    this.sirenOsc = undefined;
    this.sirenLfo = undefined;
    this.sirenLfoGain = undefined;
    this.sirenGainNode = undefined;
    if (!osc) return;
    const ctx = this.context;
    const disconnectAll = (): void => {
      try {
        osc.disconnect();
        lfo?.disconnect();
        lfoGain?.disconnect();
        g?.disconnect();
      } catch {
        // ignore
      }
    };
    try {
      if (ctx && g) {
        const now = ctx.currentTime;
        g.gain.setTargetAtTime(0, now, AUDIO.sirenGainGlideSec);
        const stopAt = now + AUDIO.sirenGainGlideSec + AUDIO.sirenStopTailSec;
        osc.stop(stopAt);
        try {
          lfo?.stop(stopAt);
        } catch {
          // ignore
        }
      } else {
        osc.stop();
        try {
          lfo?.stop();
        } catch {
          // ignore
        }
      }
      osc.onended = disconnectAll;
    } catch {
      disconnectAll();
    }
  }

  // --------------------------------------------------- continuous bus (pause)
  pauseContinuous(): void {
    const ctx = this.context;
    const bus = this.continuousBus;
    if (!ctx || !bus) return;
    try {
      bus.gain.setTargetAtTime(0, ctx.currentTime, AUDIO.continuousPauseRampSec);
    } catch {
      // never throw.
    }
  }

  resumeContinuous(): void {
    const ctx = this.context;
    const bus = this.continuousBus;
    if (!ctx || !bus) return;
    try {
      bus.gain.setTargetAtTime(1, ctx.currentTime, AUDIO.continuousPauseRampSec);
    } catch {
      // never throw.
    }
  }

  playMusic(trackId: MusicId): void {
    this.ensureStarted();
    const ctx = this.context;
    const master = this.masterGain;
    if (!ctx || !master) return;
    if (this.music?.trackId === trackId) return; // already playing this track
    this.stopMusic();
    try {
      const track = MUSIC_TRACKS[trackId];
      const bus = ctx.createGain();
      bus.gain.value = AUDIO.musicVolume;
      bus.connect(master);
      const music: ActiveMusic = {
        trackId,
        track,
        bus,
        timer: 0,
        // First copy starts a touch ahead of "now" (while suspended, currentTime
        // is frozen near 0, so this simply queues the first loop to play the
        // moment the context resumes on the first gesture).
        nextLoopStart: ctx.currentTime + 0.1,
      };
      this.music = music;
      // window.setInterval returns a number in the browser lib.
      music.timer = window.setInterval(
        () => this.pumpMusicScheduler(),
        AUDIO.schedulerIntervalMs
      );
      this.pumpMusicScheduler();
    } catch {
      // never throw.
    }
  }

  stopMusic(): void {
    const music = this.music;
    this.music = undefined;
    if (!music) return;
    try {
      window.clearInterval(music.timer);
    } catch {
      // ignore
    }
    const ctx = this.context;
    try {
      if (ctx) {
        music.bus.gain.setTargetAtTime(0, ctx.currentTime, AUDIO.musicFadeSec);
        // Disconnect after the fade so already-scheduled notes go silent then
        // release the node; guarded so a closed context can't throw.
        window.setTimeout(() => {
          try {
            music.bus.disconnect();
          } catch {
            // ignore
          }
        }, AUDIO.musicFadeMs);
      } else {
        music.bus.disconnect();
      }
    } catch {
      // never throw.
    }
  }

  /** Lookahead scheduler tick: lay down whole loop copies whose start falls
   * inside the lookahead window. No-ops unless the context is actually running,
   * so a suspended context never stacks overlapping copies at frozen time.
   *
   * WRAPPED IN A DEFENSIVE try/catch (ST-7b hardening, from the ST-7a
   * code-quality review): this runs UNATTENDED on a window.setInterval, so
   * unlike the play* methods there is no caller to absorb a throw — a bad time
   * value or a closing context surfacing here would become an uncaught console
   * error, which every playtest harness gates its exit code on. scheduleNote is
   * already individually guarded; this is belt-and-suspenders around the whole
   * body so a throw can NEVER reach the interval callback. */
  private pumpMusicScheduler(): void {
    try {
      const ctx = this.context;
      const music = this.music;
      if (!ctx || !music) return;
      if (ctx.state !== 'running') return;
      const loopSec = (music.track.beats * 60) / music.track.bpm;
      if (loopSec <= 0) return;
      const horizon = ctx.currentTime + AUDIO.scheduleAheadSec;
      let guard = 0;
      while (music.nextLoopStart < horizon && guard < 64) {
        this.scheduleMelody(music.track, music.nextLoopStart, music.bus);
        music.nextLoopStart += loopSec;
        guard++;
      }
    } catch {
      // never throw out of the unattended interval callback.
    }
  }

  private scheduleMelody(track: MusicTrack, loopStart: number, dest: AudioNode): void {
    const secPerBeat = 60 / track.bpm;
    for (const n of track.notes) {
      this.scheduleNote(
        n.note,
        loopStart + n.beat * secPerBeat,
        n.dur * secPerBeat,
        n.gain ?? track.noteGain,
        track.waveform,
        dest
      );
    }
  }

  /** Schedule one enveloped tone onto `dest`. Fully guarded — a bad time / a
   * closed context can never throw out of here. `rest`/unparseable notes (freq
   * 0) are skipped. The gain ramps mirror adsrGain()'s pure model. */
  private scheduleNote(
    note: string,
    startTime: number,
    gateSec: number,
    peak: number,
    waveform: OscillatorType,
    dest: AudioNode
  ): void {
    const ctx = this.context;
    if (!ctx) return;
    const freq = noteToFrequency(note);
    if (freq <= 0 || peak <= 0 || gateSec <= 0) return;
    try {
      const { attack, decay, sustain, release } = AUDIO.env;
      const osc = ctx.createOscillator();
      osc.type = waveform;
      osc.frequency.setValueAtTime(freq, startTime);

      const gain = ctx.createGain();
      const sustainLevel = peak * sustain;
      const a = Math.min(attack, gateSec);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(peak, startTime + a);
      gain.gain.linearRampToValueAtTime(
        sustainLevel,
        startTime + Math.min(a + decay, gateSec)
      );
      gain.gain.setValueAtTime(sustainLevel, startTime + gateSec);
      gain.gain.linearRampToValueAtTime(0, startTime + gateSec + release);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(startTime);
      osc.stop(startTime + gateSec + release + 0.02);
      osc.onended = (): void => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // ignore
        }
      };
    } catch {
      // never throw.
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton + first-gesture unlock (mirrors save.ts's getSave()).
// ---------------------------------------------------------------------------

let singleton: AudioManager | undefined;

/** Lazily-created shared AudioManager. Does NOT touch the DOM at import time —
 * the AudioContext is created only inside ensureStarted() on first gesture. */
export function getAudio(): AudioManager {
  if (!singleton) {
    singleton = new WebAudioManager();
  }
  return singleton;
}

let unlockInstalled = false;

/**
 * Install a ONE-TIME global first-gesture listener that unlocks audio. Browsers
 * block audio until a user gesture; this resumes the context on the first
 * pointer/key/touch anywhere, then removes all three listeners. Call once from
 * bootstrap (main.ts). No-op under Node / if already installed.
 */
export function installAudioUnlock(): void {
  if (typeof window === 'undefined') return;
  if (unlockInstalled) return;
  unlockInstalled = true;
  const events: readonly (keyof WindowEventMap)[] = [
    'pointerdown',
    'keydown',
    'touchstart',
  ];
  const unlock = (): void => {
    getAudio().ensureStarted();
    for (const type of events) {
      window.removeEventListener(type, unlock);
    }
  };
  for (const type of events) {
    window.addEventListener(type, unlock, { passive: true });
  }
}
