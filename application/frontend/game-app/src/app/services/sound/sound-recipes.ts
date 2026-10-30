import { SoundEffect } from './enums/sound-effect.enum';
import { SynthesizedSoundEffect } from './sound-files';
import { delayed, noise, SoundPart, tone } from './sound-part';

// The recipes of the sounds synthesized, each under a second

/** A piece set down on the wooden board: a short knock, its body lower for a heavier blow */
const knock = (body: number, gain: number = 0.6): ReadonlyArray<SoundPart> => [
    noise({ filter: 'bandpass', frequency: 1800, q: 3, duration: 0.05, gain }),
    tone({ wave: 'sine', frequency: body, to: body * 0.75, duration: 0.09, gain: gain * 0.8, attack: 0.002 }),
];

/** A clear note, ringing out */
const note = (frequency: number, at: number, duration: number, gain: number = 0.3): SoundPart =>
    tone({ wave: 'triangle', frequency, at, duration, gain, attack: 0.01 });

/** A chip set on a stack: a tiny high click of clay */
const chip = (at: number, frequency: number): ReadonlyArray<SoundPart> => [
    tone({ wave: 'sine', frequency, at, duration: 0.05, gain: 0.25, attack: 0.001 }),
    noise({ filter: 'bandpass', frequency: 5000, q: 2, at, duration: 0.03, gain: 0.3, attack: 0.001 }),
];

/** A metal part of the revolver snapping: a sharp click */
const snap = (at: number, gain: number = 0.6): ReadonlyArray<SoundPart> => [
    noise({ filter: 'bandpass', frequency: 3200, q: 6, at, duration: 0.025, gain, attack: 0.001 }),
    tone({ wave: 'square', frequency: 1800, to: 900, at, duration: 0.02, gain: gain * 0.3, attack: 0.001 }),
];

/** The chips of the pot gathered */
const gathered: ReadonlyArray<SoundPart> = [3300, 2800, 3600, 3000, 3400, 2700].flatMap((frequency: number, index: number) => chip(index * 0.045, frequency));

/** The recipes of the sounds not played from a file (SOUND_FILES) */
export const SOUND_RECIPES: Readonly<Record<SynthesizedSoundEffect, ReadonlyArray<SoundPart>>> = {
    [SoundEffect.CHESS_MOVE]: knock(220),
    // The piece knocked down, then the one taking its square
    [SoundEffect.CHESS_CAPTURE]: [...knock(260, 0.4), ...delayed(0.07, knock(150, 0.8))],
    [SoundEffect.CHESS_CHECK]: [note(880, 0, 0.12, 0.35), note(1175, 0.13, 0.22, 0.35)],
    // The king, then the rook
    [SoundEffect.CHESS_CASTLING]: [...knock(220), ...delayed(0.14, knock(190))],
    [SoundEffect.CHESS_PROMOTION]: [523, 659, 784, 1047].map((frequency: number, index: number) => note(frequency, index * 0.07, 0.22)),
    [SoundEffect.CHESS_TURN_START]: [
        tone({ wave: 'sine', frequency: 1320, duration: 0.3, gain: 0.2, attack: 0.005 }),
        tone({ wave: 'sine', frequency: 1980, duration: 0.2, gain: 0.08, attack: 0.005 }),
    ],
    // The chips gathered, then a bright chime rising
    [SoundEffect.POKER_POT_WON]: [...gathered, note(784, 0.3, 0.4, 0.25), note(1047, 0.38, 0.5, 0.25)],
    // The chips gathered, then the chime falling
    [SoundEffect.POKER_POT_LOST]: [...gathered, note(784, 0.3, 0.4, 0.25), note(587, 0.38, 0.5, 0.25)],
    // Three bullets pushed into their chambers, then the cylinder closed
    [SoundEffect.ROULETTE_LOAD]: [
        ...snap(0, 0.4), ...snap(0.18, 0.4), ...snap(0.36, 0.4),
        ...snap(0.6, 0.7), tone({ wave: 'sine', frequency: 300, to: 200, at: 0.6, duration: 0.08, gain: 0.3 }),
    ],
    // A soft pop, rising
    [SoundEffect.SEAT_TAKEN]: [
        tone({ wave: 'sine', frequency: 440, to: 660, duration: 0.12, gain: 0.3, attack: 0.005 }),
        tone({ wave: 'sine', frequency: 880, to: 1320, duration: 0.08, gain: 0.08, attack: 0.005 }),
    ],
    // A major chord rising
    [SoundEffect.GAME_WON]: [note(523, 0, 0.16), note(659, 0.15, 0.16), note(784, 0.3, 0.55, 0.35), note(392, 0.3, 0.55, 0.2)],
    // A minor chord falling
    [SoundEffect.GAME_LOST]: [note(392, 0, 0.18), note(311, 0.16, 0.18), note(262, 0.32, 0.6, 0.3), note(196, 0.32, 0.6, 0.18)],
    [SoundEffect.GAME_DRAW]: [note(659, 0, 0.28, 0.25), note(523, 0.22, 0.45, 0.25)],
    [SoundEffect.CHAT_MESSAGE]: [
        tone({ wave: 'sine', frequency: 880, to: 990, duration: 0.08, gain: 0.25 }),
        tone({ wave: 'sine', frequency: 1320, at: 0.09, duration: 0.14, gain: 0.25 }),
    ],
    [SoundEffect.ROOM_JOIN]: [note(523, 0, 0.15, 0.25), note(784, 0.1, 0.25, 0.25)],
    [SoundEffect.ROOM_LEAVE]: [note(784, 0, 0.15, 0.25), note(523, 0.1, 0.25, 0.25)],
};
