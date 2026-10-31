import { SoundEffect } from './enums/sound-effect.enum';

/** Where the files of the sounds lie, served with the app */
export const SOUNDS_PATH: string = 'assets/sounds/';

/**
 * The sounds played from a file of SOUNDS_PATH (CC0, credited in its LICENSE.md), the others synthesized at runtime. A
 * sound of several files plays one of them at random, each time
 */
export const SOUND_FILES = {
    [SoundEffect.POKER_SHUFFLE]: ['card-shuffle.mp3'],
    [SoundEffect.POKER_DEAL]: ['card-place-1.mp3'],
    [SoundEffect.POKER_CARD_TURN]: ['card-fan-1.mp3'],
    [SoundEffect.CHIPS]: ['chips-stack-1.mp3'],
    [SoundEffect.POKER_FOLD]: ['card-shove-1.mp3'],
    [SoundEffect.ROULETTE_BULLET]: ['bullet-1.mp3', 'bullet-2.mp3', 'bullet-3.mp3', 'bullet-4.mp3', 'bullet-5.mp3'],
    [SoundEffect.ROULETTE_COCK]: ['revolver-cock.mp3'],
    [SoundEffect.ROULETTE_CLICK]: ['dryfire.mp3'],
    [SoundEffect.ROULETTE_SHOT]: ['gunshot-black-powder.mp3'],
} as const satisfies Readonly<Partial<Record<SoundEffect, ReadonlyArray<string>>>>;

/** A sound playing its file from its start, then its loop, between two times of the file, until it is stopped */
export interface SoundLoop {
    readonly file: string;
    // In seconds
    readonly loopStart: number;
    readonly loopEnd: number;
}

/**
 * The sounds looping, from files of SOUNDS_PATH: the file plays from its start, then loops from loopStart to loopEnd, a period
 * of the part of the file repeating itself. A browser ignoring the gapless header of an MP3 plays up to 50 ms of silence
 * before its signal, and some after it: the loop lies inside that part whatever this silence, never at the edges of the file
 */
export const SOUND_LOOPS = {
    // The cylinder thrown, slowing down to the speed of its animation for 0.8 second, then turning while the players exchange
    // their ciphers: the same turn of 1.2 seconds (24 clicks) twice. The loop, one turn, wraps at a quiet point between two
    // clicks, quiet still when a browser plays the delay of the encoder (23 ms) before the signal
    [SoundEffect.ROULETTE_SPIN]: { file: 'spin.mp3', loopStart: 1.242, loopEnd: 2.442 },
} as const satisfies Readonly<Partial<Record<SoundEffect, SoundLoop>>>;

export type FileSoundEffect = keyof typeof SOUND_FILES;
export type LoopSoundEffect = keyof typeof SOUND_LOOPS;
/** The sounds played once, whole */
export type OneShotSoundEffect = Exclude<SoundEffect, LoopSoundEffect>;
export type SynthesizedSoundEffect = Exclude<OneShotSoundEffect, FileSoundEffect>;

export function isFileSound(effect: SoundEffect): effect is FileSoundEffect {
    return effect in SOUND_FILES;
}

export function isLoopSound(effect: SoundEffect): effect is LoopSoundEffect {
    return effect in SOUND_LOOPS;
}

/** The files a sound plays, none for a sound synthesized */
export function soundFiles(effect: SoundEffect): ReadonlyArray<string> {
    if (isFileSound(effect)) {
        return SOUND_FILES[effect];
    }
    return isLoopSound(effect) ? [SOUND_LOOPS[effect].file] : [];
}
