import { HttpClient } from '@angular/common/http';
import { computed, DestroyRef, DOCUMENT, effect, inject, Injectable, Signal, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { storageChanges, storedNumber, storedValue, storeValue } from '@app/helpers/stored-preference.helper';
import { merge } from 'rxjs';
import { SoundCategory } from './enums/sound-category.enum';
// Types only: the sounds, their files and their categories load with the engine, out of the bundle of the start of the app
import type { SoundEffect } from './enums/sound-effect.enum';
import { SoundState } from './enums/sound-state.enum';
import type { SoundEngine } from './sound-engine';
import type { LoopSoundEffect, OneShotSoundEffect } from './sound-files';

export type Audio = {
    context: AudioContext;
    // The volume of every sound
    output: GainNode;
    // The sounds of each category, into the output: silent once muted
    categories: Readonly<Record<SoundCategory, GainNode>>;
};

/**
 * The sound effects of the games, through the Web Audio API: one AudioContext for the app. The browsers block the audio
 * until a gesture on the page: the context is created, or resumed, at a trusted gesture. Before it, no sound plays, without
 * any error. Created as the app starts (app.config.ts), for its first gesture to start the audio: the engine playing the
 * sounds loads then, out of the bundle of the start of the app, and no sound plays while it loads.
 *
 * The volume, and whether the sounds are muted, all of them or a category (the game, the chat), are kept in the local
 * storage, and followed by the other tabs of the app. Muting keeps the volume, for unmuting.
 */
@Injectable({
    providedIn: 'root',
})
export class SoundService {
    public static readonly volumeKey: string = 'sound-volume';
    public static readonly stateKey: string = 'sound';
    /** The key of the state of each category of sounds */
    public static readonly categoryKeys: Readonly<Record<SoundCategory, string>> = { [SoundCategory.GAME]: 'sound-game', [SoundCategory.CHAT]: 'sound-chat' };
    public static readonly DEFAULT_VOLUME: number = 60;
    public static readonly MAX_VOLUME: number = 100;
    // The gestures activating the page, which let the audio start: not a move of the pointer nor the wheel
    private static readonly ACTIVATIONS: ReadonlyArray<keyof DocumentEventMap> = ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click'];

    private readonly document = inject(DOCUMENT);
    private readonly window: Window = this.document.defaultView as Window;
    private readonly http = inject(HttpClient);
    private audio?: Audio;
    // Loaded once the audio starts
    private engine?: SoundEngine;
    private engineLoading: boolean = false;
    // The latest control asked of the audio, settled or not: its state tells the controls settled only
    private requested?: 'suspend' | 'resume';
    // A resume asked in the current task: a sound asked with it is scheduled, heard once the audio runs
    private resumeAsked: boolean = false;
    private readonly isStarted = signal<boolean>(false);
    // The sounds whose files load once the engine does
    private readonly preloads = new Set<SoundEffect>();
    private readonly currentVolume = signal<number>(this.storedVolume());
    private readonly isMuted = signal<boolean>(this.storedMuted());
    private readonly mutedCategories = signal<ReadonlySet<SoundCategory>>(this.storedMutedCategories());

    public readonly volume: Signal<number> = this.currentVolume.asReadonly();
    public readonly muted: Signal<boolean> = this.isMuted.asReadonly();
    /** The audio started, at a gesture of the page, and its engine loaded: a sound looping asked before is asked again then */
    public readonly started: Signal<boolean> = this.isStarted.asReadonly();
    // The gain of the output: the ear hears a loudness growing with its square
    private readonly level = computed<number>(() => this.isMuted() ? 0 : (this.currentVolume() / SoundService.MAX_VOLUME) ** 2);

    public constructor() {
        const destroyRef = inject(DestroyRef);

        // Another tab of the app changed the volume or muted the sounds, or cleared the storage (an event without key)
        merge(...[SoundService.volumeKey, SoundService.stateKey, ...Object.values(SoundService.categoryKeys)].map((key: string) => storageChanges(this.window, key)))
            .pipe(takeUntilDestroyed(destroyRef))
            .subscribe(() => {
                this.currentVolume.set(this.storedVolume());
                this.isMuted.set(this.storedMuted());
                this.mutedCategories.set(this.storedMutedCategories());
            });

        // The audio follows the volume and the mutes, a sound looping included
        effect(() => {
            const level: number = this.level();
            const muted: ReadonlySet<SoundCategory> = this.mutedCategories();
            untracked(() => this.applyLevel(level, muted));
        });

        // A browser without the Web Audio API plays no sound
        if (typeof AudioContext === 'undefined') {
            return;
        }

        // Captured: seen before an element of the page stops it. Kept listening: a browser can suspend the audio again, a
        // phone during a call. A gesture the browser does not count as an activation (a touch starting, Escape) would start
        // it suspended, with a warning
        const onActivation = (event: Event): void => {
            if (event.isTrusted && this.window.navigator.userActivation?.isActive !== false) {
                this.startAudio();
            }
        };
        SoundService.ACTIVATIONS.forEach((type: keyof DocumentEventMap) => this.document.addEventListener(type, onActivation, { capture: true, passive: true }));
        destroyRef.onDestroy(() => SoundService.ACTIVATIONS.forEach((type: keyof DocumentEventMap) =>
            this.document.removeEventListener(type, onActivation, { capture: true })));
    }

    public setVolume(volume: number): void {
        this.currentVolume.set(volume);
        storeValue(this.window, SoundService.volumeKey, `${ volume }`);
        // Setting the volume while muted means to hear the sounds
        this.setMuted(false);
    }

    public setMuted(muted: boolean): void {
        this.isMuted.set(muted);
        storeValue(this.window, SoundService.stateKey, muted ? SoundState.MUTED : SoundState.ON);
        this.applyLevel(this.level(), this.mutedCategories());
    }

    /** Whether the sounds of a category are muted, whatever the mute of every sound */
    public categoryMuted(category: SoundCategory): boolean {
        return this.mutedCategories().has(category);
    }

    public setCategoryMuted(category: SoundCategory, muted: boolean): void {
        this.mutedCategories.update((categories: ReadonlySet<SoundCategory>) => {
            const next = new Set<SoundCategory>(categories);
            if (muted) {
                next.add(category);
            } else {
                next.delete(category);
            }
            return next;
        });
        storeValue(this.window, SoundService.categoryKeys[category], muted ? SoundState.MUTED : SoundState.ON);
        this.applyLevel(this.level(), this.mutedCategories());
    }

    /** Loads ahead the files of the sounds of a page, once the audio starts: their first play is not late */
    public preload(effects: ReadonlyArray<SoundEffect>): void {
        effects.forEach((effect: SoundEffect) => this.preloads.add(effect));
        this.loadPreloads();
    }

    /**
     * Plays the sound, from its file or synthesized, later by the delay in seconds, unless the audio did not start yet, its
     * engine loads, or the sounds are muted, all of them or its category. A sound of several files plays one of them at
     * random; a file failing to load plays nothing
     */
    public play(effect: OneShotSoundEffect, delay: number = 0): void {
        this.engine?.play(effect, delay);
    }

    /**
     * Plays the start of a sound looping, then its loop, until the function returned stops it, fading it out. Nothing plays
     * before the audio starts, nor while its engine loads; muted, all the sounds or its category, it plays silently, heard
     * once unmuted. A file failing to load plays nothing
     */
    public loop(effect: LoopSoundEffect): () => void {
        return this.engine?.loop(effect) ?? ((): void => undefined);
    }

    /**
     * Plays the file of a sound, of no category, loaded and decoded the first time, later by the delay in seconds once
     * decoded, unless the audio did not start yet, its engine loads, or the sounds are muted
     */
    public playFile(url: string, delay: number = 0): Promise<void> {
        return this.engine?.playFile(url, delay) ?? Promise.resolve();
    }

    private startAudio(): void {
        if (this.audio === undefined) {
            const context = new AudioContext();
            const output: GainNode = context.createGain();
            output.connect(context.destination);
            const categories = {} as Record<SoundCategory, GainNode>;
            Object.values(SoundCategory).forEach((category: SoundCategory) => {
                categories[category] = context.createGain();
                categories[category].connect(output);
            });
            this.audio = { context, output, categories };
        }

        this.loadEngine(this.audio);
        this.applyLevel(this.level(), this.mutedCategories());
    }

    private loadPreloads(): void {
        if (this.engine === undefined) {
            return;
        }
        this.engine.preload([...this.preloads]);
        this.preloads.clear();
    }

    /**
     * Sets the volume and the mutes on the audio, its gains starting at 1. The audio runs while a sound may be heard, and is
     * suspended once every sound is muted, all of them or both categories: a page keeps no audio device awake for sounds it
     * will not play
     */
    private applyLevel(level: number, muted: ReadonlySet<SoundCategory>): void {
        const audio: Audio | undefined = this.audio;
        if (audio === undefined) {
            return;
        }

        audio.output.gain.value = level;
        Object.values(SoundCategory).forEach((category: SoundCategory) => {
            audio.categories[category].gain.value = muted.has(category) ? 0 : 1;
        });
        const silent: boolean = level === 0 || Object.values(SoundCategory).every((category: SoundCategory) => muted.has(category));
        // The state tells the controls settled only: a control pending is told by the latest one asked
        const { state } = audio.context;
        // A new audio, which a browser may start by itself once the gesture creating it allows it, is suspended too
        if (silent && (state === 'running' || this.requested !== 'suspend')) {
            this.requested = 'suspend';
            audio.context.suspend().catch(() => undefined);
        } else if (!silent && (state !== 'running' || this.requested === 'suspend')) {
            this.resume(audio);
        }
    }

    /**
     * Resumes the audio, the sounds asked in the same task scheduled on it. Asked again at each gesture: a browser that did
     * not let the audio start keeps the resume pending until a gesture lets it
     */
    private resume(audio: Audio): void {
        this.requested = 'resume';
        audio.context.resume().catch(() => undefined);
        this.resumeAsked = true;
        queueMicrotask(() => {
            this.resumeAsked = false;
        });
    }

    /**
     * The engine, with the files, the synthesizer and the recipes of the sounds, loads once the audio starts, out of the
     * bundle of the start of the app: the preloads wait for it, the audio starting once it plays. Failing (the network lost,
     * a former bundle gone), the next gesture loads it again
     */
    private loadEngine(audio: Audio): void {
        if (this.engine !== undefined || this.engineLoading) {
            return;
        }

        this.engineLoading = true;
        this.importEngine()
            .then(({ SoundEngine }) => {
                this.engine = new SoundEngine(audio, this.http, {
                    playing: (category?: SoundCategory): Audio | undefined => this.playingAudio(category),
                    resumed: (category?: SoundCategory): boolean => this.requested === 'resume' && this.audible(category),
                });
                this.loadPreloads();
                this.isStarted.set(true);
            })
            .catch(() => undefined)
            .finally(() => {
                this.engineLoading = false;
            });
    }

    private importEngine(): Promise<typeof import('./sound-engine')> {
        return import('./sound-engine');
    }

    /**
     * The audio, at the volume of the sounds, when it plays them: the ones of a category, unless muted. The volume set at
     * once, before the effect following it: a sound played right after the volume changed is heard at it. An audio resumed
     * in the same task plays too, the sound starting once it runs; an audio not running else plays nothing, the sounds asked
     * meanwhile would all start at once when it resumes
     */
    private playingAudio(category?: SoundCategory): Audio | undefined {
        const audio: Audio | undefined = this.audio;
        if (audio === undefined || !this.audible(category)) {
            return undefined;
        }

        // A file of no category (the sound lab) wakes the audio suspended, or suspending, while both categories are muted
        if (category === undefined && (audio.context.state !== 'running' || this.requested === 'suspend')) {
            this.resume(audio);
        }
        if (audio.context.state !== 'running' && !this.resumeAsked) {
            return undefined;
        }

        audio.output.gain.value = this.level();
        return audio;
    }

    /** Whether a sound of the category may be heard: a file of no category whenever the volume is up */
    private audible(category?: SoundCategory): boolean {
        return this.level() > 0 && (category === undefined || !this.categoryMuted(category));
    }

    // Nothing stored, or the storage unavailable: the default volume
    private storedVolume(): number {
        return storedNumber(this.window, SoundService.volumeKey, 0, SoundService.MAX_VOLUME) ?? SoundService.DEFAULT_VOLUME;
    }

    // Nothing stored, or the storage unavailable: the sounds play
    private storedMuted(): boolean {
        return storedValue(this.window, SoundService.stateKey, SoundState) === SoundState.MUTED;
    }

    // Nothing stored, or the storage unavailable: every category plays
    private storedMutedCategories(): ReadonlySet<SoundCategory> {
        return new Set<SoundCategory>(Object.values(SoundCategory)
            .filter((category: SoundCategory) => storedValue(this.window, SoundService.categoryKeys[category], SoundState) === SoundState.MUTED));
    }
}
