import { Noise, PartTiming, SoundPart, Tone } from './sound-part';
import { SynthesizedSoundEffect } from './sound-files';
import { SOUND_RECIPES } from './sound-recipes';

/**
 * Plays the sounds synthesized at runtime, by their recipes. Loaded with the engine of the sounds (SoundEngine), out of the
 * bundle of the start of the app
 */
export class SoundSynth {
    private static readonly DEFAULT_ATTACK: number = 0.005;
    // An exponential fade ends above 0
    private static readonly SILENCE: number = 0.0001;
    // The noise lasts that long, in seconds: a part of noise longer than it loops on it
    private static readonly NOISE_DURATION: number = 0.5;
    // getRandomValues() fills 65536 bytes at most at once
    private static readonly RANDOM_CHUNK: number = 32_768;

    private readonly noiseBuffer: AudioBuffer;

    public constructor(private readonly context: BaseAudioContext) {
        this.noiseBuffer = this.whiteNoise();
    }

    /** Plays the sound into the output, later by the delay, in seconds */
    public play(effect: SynthesizedSoundEffect, output: AudioNode, delay: number = 0): void {
        const start: number = this.context.currentTime + delay;
        SOUND_RECIPES[effect].forEach((part: SoundPart) => 'tone' in part ? this.playTone(part.tone, start, output) : this.playNoise(part.noise, start, output));
    }

    private playTone(part: Readonly<Tone>, start: number, output: AudioNode): void {
        const oscillator: OscillatorNode = this.context.createOscillator();
        oscillator.type = part.wave;
        const [from, to]: [number, number] = this.glide(oscillator.frequency, part, start);
        oscillator.connect(this.envelope(part, start)).connect(output);
        oscillator.start(from);
        oscillator.stop(to);
    }

    private playNoise(part: Readonly<Noise>, start: number, output: AudioNode): void {
        const source: AudioBufferSourceNode = this.context.createBufferSource();
        source.buffer = this.noiseBuffer;
        source.loop = true;
        const filter: BiquadFilterNode = this.context.createBiquadFilter();
        filter.type = part.filter;
        filter.Q.value = part.q;
        const [from, to]: [number, number] = this.glide(filter.frequency, part, start);
        source.connect(filter).connect(this.envelope(part, start)).connect(output);
        source.start(from);
        source.stop(to);
    }

    /** Glides the frequency over the part, and tells when the part starts and stops */
    private glide(frequency: AudioParam, part: Readonly<Tone | Noise>, start: number): [number, number] {
        const from: number = start + (part.at ?? 0);
        const to: number = from + part.duration;
        frequency.setValueAtTime(part.frequency, from);
        if (part.to !== undefined) {
            frequency.exponentialRampToValueAtTime(part.to, to);
        }
        return [from, to];
    }

    /** Fades the part in up to its peak, then out exponentially, as a struck object rings */
    private envelope(part: Readonly<PartTiming>, start: number): GainNode {
        const envelope: GainNode = this.context.createGain();
        const from: number = start + (part.at ?? 0);
        const attack: number = Math.min(part.attack ?? SoundSynth.DEFAULT_ATTACK, part.duration);
        envelope.gain.setValueAtTime(0, from);
        envelope.gain.linearRampToValueAtTime(part.gain, from + attack);
        envelope.gain.exponentialRampToValueAtTime(SoundSynth.SILENCE, from + part.duration);
        return envelope;
    }

    private whiteNoise(): AudioBuffer {
        const length: number = Math.round(this.context.sampleRate * SoundSynth.NOISE_DURATION);
        const buffer: AudioBuffer = this.context.createBuffer(1, length, this.context.sampleRate);
        const random = new Int16Array(length);
        for (let offset = 0; offset < length; offset += SoundSynth.RANDOM_CHUNK) {
            crypto.getRandomValues(random.subarray(offset, offset + SoundSynth.RANDOM_CHUNK));
        }
        buffer.copyToChannel(Float32Array.from(random, (sample: number) => sample / 32_768), 0);
        return buffer;
    }
}
