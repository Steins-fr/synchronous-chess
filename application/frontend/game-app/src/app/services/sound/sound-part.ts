// The parts of a sound synthesized at runtime, layered and chained in time: each an oscillator or a filtered noise faded in
// then out. No file: the clicks, the chimes and the thumps sound right that way

export type PartTiming = {
    // When it starts, in seconds after the sound starts
    at?: number;
    // How long it lasts, in seconds, its fade-out included
    duration: number;
    // Its peak, from 0 to 1
    gain: number;
    // How long its fade-in lasts, in seconds
    attack?: number;
};

export type Tone = PartTiming & {
    wave: OscillatorType;
    // In hertz
    frequency: number;
    // The frequency it glides to, by its end
    to?: number;
};

export type Noise = PartTiming & {
    filter: BiquadFilterType;
    // The frequency of the filter, in hertz
    frequency: number;
    // The frequency the filter glides to, by its end
    to?: number;
    // The quality of the filter: the higher, the narrower its band
    q: number;
};

export type SoundPart = Readonly<{ tone: Readonly<Tone> } | { noise: Readonly<Noise> }>;

export const tone = (part: Readonly<Tone>): SoundPart => ({ tone: part });

export const noise = (part: Readonly<Noise>): SoundPart => ({ noise: part });

/** The parts, each moved later by the delay, in seconds */
export const delayed = (delay: number, parts: ReadonlyArray<SoundPart>): ReadonlyArray<SoundPart> => parts.map((part: SoundPart) =>
    'tone' in part ? tone({ ...part.tone, at: (part.tone.at ?? 0) + delay }) : noise({ ...part.noise, at: (part.noise.at ?? 0) + delay }));
