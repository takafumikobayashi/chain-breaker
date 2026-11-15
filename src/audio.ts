import type { ItemKind, SoundCues } from "./simulation";

/**
 * Soft, synthesised sound design (no audio files). Everything is tuned for comfort:
 * notes come from a major pentatonic scale so any overlap stays consonant, tones are sine-based
 * with gentle attacks, highs are rolled off, a light reverb glues things together and a
 * compressor keeps peaks in check. Dense destruction becomes a swelling pad instead of clatter.
 */

/** G4 major-pentatonic ladder used for block breaks. */
const SCALE = [392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
/** Pad chord (C major add9 voicing, low and wide). */
const PAD_CHORD = [130.81, 196, 293.66, 329.63, 392];

/** Minimum real-time gaps (s) between repeated sounds of one kind, so nothing machine-guns. */
const GAP = { break: 0.055, concrete: 0.16, paddle: 0.09, bombBlock: 0.12 };
/** Break rate (per second) at which the pad reaches full level. */
const PAD_FULL_RATE = 160;
const PAD_MAX_GAIN = 0.11;
/** A pause longer than this between breaks restarts the melody from the bottom of the scale. */
const MELODY_RESET_SECONDS = 0.7;

export const DEFAULT_VOLUME = 0.6;

export class SoundEngine {
  private context: AudioContext | null = null;
  private input: GainNode | null = null;
  private master: GainNode | null = null;
  private padGain: GainNode | null = null;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = DEFAULT_VOLUME;
  private muted = false;
  private lastPlayed = { break: -1, concrete: -1, paddle: -1, bombBlock: -1 };
  private lastBreakAt = -1;
  private melodyStep = 0;
  private breakRate = 0;

  /**
   * Creates or resumes the audio context. Must be called from a user gesture (click / tap / key).
   * Also recovers iOS's "interrupted" state (after a call, Siri or switching apps).
   */
  unlock(): void {
    if (!this.context) this.build();
    const context = this.context;
    if (!context || context.state === "running") return;
    void context.resume().catch(() => undefined);
    // Older iOS Safari only unlocks Web Audio once a sound has been started inside the gesture.
    {
      const silence = context.createBufferSource();
      silence.buffer = context.createBuffer(1, 1, context.sampleRate);
      silence.connect(context.destination);
      silence.start();
    }
  }

  /** True once the browser is actually letting the context play. */
  get running(): boolean {
    return this.context?.state === "running";
  }

  get ready(): boolean {
    return this.context !== null;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyMasterLevel();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMasterLevel();
  }

  /** Audio stream that mirrors what the viewer hears, for mixing into screen recordings. */
  recordingStream(): MediaStream | null {
    return this.recordingDestination?.stream ?? null;
  }

  /**
   * Turns one frame's worth of simulation cues into sound. `active` is false while paused, idle or
   * finished; it only fades the pad, since cues are produced while the simulation runs anyway
   * (the frame that clears the field already reports "finished" but still carries its cues).
   */
  play(cues: SoundCues, active: boolean, frameSeconds: number): void {
    const context = this.context;
    if (!context || context.state !== "running") return;
    const now = context.currentTime;

    // Smoothed break rate drives the pad level.
    const instantRate = active && frameSeconds > 0 ? cues.breaks / frameSeconds : 0;
    this.breakRate += (instantRate - this.breakRate) * Math.min(1, frameSeconds * 2.5);
    this.updatePad(active ? this.breakRate : 0, now);

    if (cues.breaks > 0) this.playBreaks(cues, now);
    // Wall taps only while things are calm; once the pad swells they would just add a monotonous tick.
    const calm = this.breakRate < PAD_FULL_RATE * 0.25;
    if (cues.concrete > 0 && calm && this.allow("concrete", now)) this.playConcrete(now);
    if (cues.paddle > 0 && this.allow("paddle", now)) this.playPaddle(now);
    for (const kind of cues.capsules) this.playCapsule(kind, now);
    for (const radius of cues.blasts) {
      if (radius > 30) this.playBigBlast(now);
      else if (this.allow("bombBlock", now)) this.playSmallBlast(now);
    }
    if (cues.cleared) this.playClear(now);
  }

  /* ---------- Graph ---------- */

  private build(): void {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    this.context = context;

    const input = context.createGain();
    const dry = context.createGain();
    dry.gain.value = 0.82;
    const reverb = context.createConvolver();
    reverb.buffer = makeImpulse(context, 2.4);
    const wet = context.createGain();
    wet.gain.value = 0.3;
    const tone = context.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 7_500;
    tone.Q.value = 0.4;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.25;
    const master = context.createGain();

    input.connect(dry).connect(tone);
    input.connect(reverb).connect(wet).connect(tone);
    tone.connect(compressor).connect(master);
    master.connect(context.destination);
    this.recordingDestination = context.createMediaStreamDestination();
    master.connect(this.recordingDestination);

    this.input = input;
    this.master = master;
    this.noise = makeNoise(context, 2);
    this.buildPad(context, input);
    this.applyMasterLevel();
  }

  /** A held, slowly breathing chord whose level follows how much is breaking. */
  private buildPad(context: AudioContext, destination: AudioNode): void {
    const padGain = context.createGain();
    padGain.gain.value = 0;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.3;
    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();
    lfo.frequency.value = 0.18;
    lfoDepth.gain.value = 260;
    lfo.connect(lfoDepth).connect(filter.frequency);
    lfo.start();
    PAD_CHORD.forEach((frequency, index) => {
      for (const detune of [-6, 6]) {
        const oscillator = context.createOscillator();
        oscillator.type = index === 0 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        oscillator.detune.value = detune;
        const voice = context.createGain();
        voice.gain.value = index === 0 ? 0.5 : 0.22;
        oscillator.connect(voice).connect(filter);
        oscillator.start();
      }
    });
    filter.connect(padGain).connect(destination);
    this.padGain = padGain;
  }

  private applyMasterLevel(): void {
    if (!this.master || !this.context) return;
    const level = this.muted ? 0 : this.volume * this.volume * 0.9;
    this.master.gain.setTargetAtTime(level, this.context.currentTime, 0.05);
  }

  private updatePad(rate: number, now: number): void {
    if (!this.padGain) return;
    const level = Math.min(1, rate / PAD_FULL_RATE) ** 0.8 * PAD_MAX_GAIN;
    this.padGain.gain.setTargetAtTime(level, now, 0.35);
  }

  private allow(kind: keyof SoundEngine["lastPlayed"], now: number): boolean {
    if (now - this.lastPlayed[kind] < GAP[kind]) return false;
    this.lastPlayed[kind] = now;
    return true;
  }

  /* ---------- Voices ---------- */

  /**
   * One soft mallet note per allowed slot. The melody walks up and down the pentatonic ladder
   * while breaks keep coming, and restarts low after a pause. Louder when many blocks break at once.
   */
  private playBreaks(cues: SoundCues, now: number): void {
    if (now - this.lastBreakAt > MELODY_RESET_SECONDS) this.melodyStep = 0;
    this.lastBreakAt = now;
    if (!this.allow("break", now)) return;
    // Thin out single notes as the pad takes over, so dense moments stay calm.
    const padShare = Math.min(1, this.breakRate / PAD_FULL_RATE);
    if (padShare > 0.5 && Math.random() < padShare - 0.35) return;

    const span = SCALE.length * 2 - 2;
    const position = this.melodyStep % span;
    const note = SCALE[position < SCALE.length ? position : span - position];
    this.melodyStep += 1;
    const loudness = Math.min(1, 0.55 + Math.log2(1 + cues.breaks) * 0.12) * (1 - padShare * 0.4);
    const useA = cues.breaksA >= cues.breaks - cues.breaksA;
    this.mallet(note, now, 0.16 * loudness, useA ? 2 : 3, useA ? 0.4 : 0.55);
  }

  private playConcrete(now: number): void {
    this.tone({ frequency: 210, endFrequency: 170, type: "sine", gain: 0.05, attack: 0.004, decay: 0.12, at: now });
  }

  private playPaddle(now: number): void {
    this.tone({ frequency: 520, endFrequency: 470, type: "sine", gain: 0.07, attack: 0.006, decay: 0.22, at: now });
    this.tone({ frequency: 1040, type: "sine", gain: 0.015, attack: 0.006, decay: 0.12, at: now });
  }

  private playCapsule(kind: ItemKind, now: number): void {
    if (kind === "plus") {
      [523.25, 659.25, 783.99].forEach((frequency, index) => this.bell(frequency, now + index * 0.07, 0.09));
    } else if (kind === "times") {
      [392, 523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((frequency, index) => this.bell(frequency, now + index * 0.055, 0.08));
      this.swell(now, 1.2, 0.05);
    } else {
      // Bomb capsule: a short soft rising cue before the blast itself.
      this.tone({ frequency: 330, endFrequency: 660, type: "triangle", gain: 0.05, attack: 0.02, decay: 0.25, at: now });
    }
  }

  /** Big blast: deep sine thump, a low filtered noise bloom and a warm chord tail. */
  private playBigBlast(now: number): void {
    this.tone({ frequency: 92, endFrequency: 38, type: "sine", gain: 0.34, attack: 0.01, decay: 1.3, at: now });
    this.noiseBurst(now, { from: 900, to: 160, gain: 0.16, decay: 1.4 });
    [196, 293.66, 392].forEach((frequency) => this.tone({ frequency, type: "sine", gain: 0.035, attack: 0.15, decay: 1.8, at: now + 0.05 }));
  }

  private playSmallBlast(now: number): void {
    const pitch = 0.9 + Math.random() * 0.25;
    this.tone({ frequency: 120 * pitch, endFrequency: 55 * pitch, type: "sine", gain: 0.14, attack: 0.006, decay: 0.45, at: now });
    this.noiseBurst(now, { from: 700, to: 200, gain: 0.06, decay: 0.4 });
  }

  /** Field cleared: an unhurried rising arpeggio over a warm swell. */
  private playClear(now: number): void {
    [261.63, 329.63, 392, 523.25, 587.33, 783.99, 1046.5].forEach((frequency, index) => this.bell(frequency, now + index * 0.12, 0.09));
    this.swell(now, 3.2, 0.07);
  }

  /* ---------- Building blocks ---------- */

  /** Marimba-like note: sine fundamental plus one quiet overtone, fast attack, smooth decay. */
  private mallet(frequency: number, at: number, gain: number, overtone: number, decay: number): void {
    this.tone({ frequency, type: "sine", gain, attack: 0.004, decay, at });
    this.tone({ frequency: frequency * overtone, type: "sine", gain: gain * 0.18, attack: 0.003, decay: decay * 0.35, at });
  }

  /** Glassy bell: fundamental with a slightly inharmonic shimmer. */
  private bell(frequency: number, at: number, gain: number): void {
    this.tone({ frequency, type: "sine", gain, attack: 0.005, decay: 0.9, at });
    this.tone({ frequency: frequency * 2.76, type: "sine", gain: gain * 0.12, attack: 0.004, decay: 0.35, at });
  }

  /** Slow airy chord swell used under big positive moments. */
  private swell(at: number, length: number, gain: number): void {
    for (const frequency of [261.63, 392, 587.33]) {
      this.tone({ frequency, type: "triangle", gain, attack: length * 0.35, decay: length * 0.65, at, lowpass: 1_400 });
    }
  }

  private tone(options: {
    frequency: number;
    endFrequency?: number;
    type: OscillatorType;
    gain: number;
    attack: number;
    decay: number;
    at: number;
    lowpass?: number;
  }): void {
    const context = this.context;
    const input = this.input;
    if (!context || !input) return;
    const { frequency, endFrequency, type, gain, attack, decay, at, lowpass } = options;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + attack + decay);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain, at + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    let last: AudioNode = oscillator.connect(envelope);
    if (lowpass) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lowpass;
      last = last.connect(filter);
    }
    last.connect(input);
    oscillator.start(at);
    oscillator.stop(at + attack + decay + 0.05);
  }

  private noiseBurst(at: number, options: { from: number; to: number; gain: number; decay: number }): void {
    const context = this.context;
    const input = this.input;
    if (!context || !input || !this.noise) return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.5;
    filter.frequency.setValueAtTime(options.from, at);
    filter.frequency.exponentialRampToValueAtTime(options.to, at + options.decay);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(options.gain, at + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + options.decay);
    source.connect(filter).connect(envelope).connect(input);
    source.start(at);
    source.stop(at + options.decay + 0.05);
  }
}

/** Stereo impulse response: decaying noise, darker over time, for a soft room. */
function makeImpulse(context: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let smooth = 0;
    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      // One-pole lowpass whose cutoff falls over time makes the tail warmer.
      const coefficient = 0.25 + progress * 0.7;
      smooth = smooth * coefficient + (Math.random() * 2 - 1) * (1 - coefficient);
      data[index] = smooth * (1 - progress) ** 2.6 * 2.2;
    }
  }
  return buffer;
}

function makeNoise(context: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
}
