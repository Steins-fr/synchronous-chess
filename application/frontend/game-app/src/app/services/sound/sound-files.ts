import { SoundEffect } from './enums/sound-effect.enum';

/** Where the files of the sounds lie, served with the app */
export const SOUNDS_PATH: string = 'assets/sounds/';

/**
 * The sounds played from a file of SOUNDS_PATH (CC0, credited in its LICENSE.md), the others synthesized at runtime. A
 * sound of several files plays one of them at random, each time
 */
export const SOUND_FILES = {
    [SoundEffect.POKER_SHUFFLE]: ['card-shuffle.wav'],
    [SoundEffect.POKER_DEAL]: ['card-place-1.wav'],
    [SoundEffect.POKER_CARD_TURN]: ['card-fan-1.wav'],
    [SoundEffect.CHIPS]: ['chips-stack-1.wav'],
    [SoundEffect.POKER_FOLD]: ['card-shove-1.wav'],
    [SoundEffect.ROULETTE_BULLET]: ['bullet-1.wav', 'bullet-2.wav', 'bullet-3.wav', 'bullet-4.wav', 'bullet-5.wav'],
    [SoundEffect.ROULETTE_COCK]: ['revolver-cock.wav'],
    [SoundEffect.ROULETTE_CLICK]: ['dryfire.wav'],
    [SoundEffect.ROULETTE_SHOT]: ['gunshot-black-powder.wav'],
} as const satisfies Readonly<Partial<Record<SoundEffect, ReadonlyArray<string>>>>;

/** A sound playing its start once, then its loop until it is stopped */
export interface SoundLoop {
    readonly start: string;
    readonly loop: string;
}

/** The sounds looping, from files of SOUNDS_PATH: the start ends where the loop starts, for the loop to follow it seamlessly */
export const SOUND_LOOPS = {
    // The cylinder thrown, slowing down to the speed of its animation, then turning while the players exchange their ciphers
    [SoundEffect.ROULETTE_SPIN]: { start: 'spin-start.wav', loop: 'spin-idle.wav' },
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
    return isLoopSound(effect) ? [SOUND_LOOPS[effect].start, SOUND_LOOPS[effect].loop] : [];
}
