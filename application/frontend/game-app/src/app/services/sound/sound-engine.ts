import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SoundCategory } from './enums/sound-category.enum';
import { SoundEffect } from './enums/sound-effect.enum';
import { soundCategory } from './sound-categories';
import { isFileSound, LoopSoundEffect, OneShotSoundEffect, SOUND_FILES, SOUND_LOOPS, soundFiles, SOUNDS_PATH } from './sound-files';
import { SoundSynth } from './sound-synth';
import type { Audio } from './sound.service';

/** What the engine asks of the service, which follows the volume, the mutes and the controls asked of the audio */
export interface AudioGate {
    /** The audio when it plays a sound of the category now, at the volume of the sounds; a file of no category else */
    playing(category?: SoundCategory): Audio | undefined;
    /** Whether a sound asked as the audio resumed still plays once decoded: the resume the latest control asked, the sound audible */
    resumed(category?: SoundCategory): boolean;
}

/**
 * Plays the sounds on the audio of the SoundService: the files, loaded and decoded once, the sounds looping and the sounds
 * synthesized. Loaded once the audio starts, out of the bundle of the start of the app
 */
export class SoundEngine {
    /** The time a sound looping fades out once stopped, in seconds */
    public static readonly LOOP_FADE: number = 0.05;

    private readonly synth: SoundSynth;
    // The files of the sounds, decoded once
    private readonly files = new Map<string, Promise<AudioBuffer>>();

    public constructor(private readonly audio: Audio, private readonly http: HttpClient, private readonly gate: AudioGate) {
        this.synth = new SoundSynth(audio.context);
    }

    /** Loads ahead the files of the sounds: their first play is not late */
    public preload(effects: ReadonlyArray<SoundEffect>): void {
        effects.flatMap((effect: SoundEffect) => soundFiles(effect)).forEach((file: string) => {
            this.decodedFile(`${ SOUNDS_PATH }${ file }`).catch(() => undefined);
        });
    }

    /** Plays the sound, from its file or synthesized: SoundService.play() */
    public play(effect: OneShotSoundEffect, delay: number): void {
        const category: SoundCategory = soundCategory(effect);
        if (isFileSound(effect)) {
            const files: ReadonlyArray<string> = SOUND_FILES[effect];
            // Not CryptoHelper: the engine loads at the first gesture, its bundle kept small
            const file: string = files[crypto.getRandomValues(new Uint32Array(1))[0] % files.length];
            this.playFileInto(`${ SOUNDS_PATH }${ file }`, delay, category).catch(() => undefined);
            return;
        }

        const audio: Audio | undefined = this.gate.playing(category);
        if (audio !== undefined) {
            this.synth.play(effect, audio.categories[category], delay);
        }
    }

    /** Plays the start of a sound looping, then its loop, until the function returned stops it: SoundService.loop() */
    public loop(effect: LoopSoundEffect): () => void {
        // Scheduled on a suspended audio too: it plays once the audio runs
        const { context } = this.audio;
        const fade: GainNode = context.createGain();
        fade.connect(this.audio.categories[soundCategory(effect)]);
        const sources: AudioBufferSourceNode[] = [];
        let stopped: boolean = false;
        const { start, loop } = SOUND_LOOPS[effect];

        Promise.all([this.decodedFile(`${ SOUNDS_PATH }${ start }`), this.decodedFile(`${ SOUNDS_PATH }${ loop }`)])
            .then(([startBuffer, loopBuffer]: [AudioBuffer, AudioBuffer]) => {
                if (stopped) {
                    return;
                }
                const first: AudioBufferSourceNode = context.createBufferSource();
                first.buffer = startBuffer;
                const looping: AudioBufferSourceNode = context.createBufferSource();
                looping.buffer = loopBuffer;
                looping.loop = true;
                [first, looping].forEach((source: AudioBufferSourceNode) => source.connect(fade));
                // The loop follows the start to the sample
                first.start(context.currentTime);
                looping.start(context.currentTime + startBuffer.duration);
                sources.push(first, looping);
            })
            .catch(() => undefined);

        return () => {
            if (stopped) {
                return;
            }
            stopped = true;
            // Suspended, its time stands still: a fade would play once the audio resumes
            if (context.state !== 'running') {
                fade.disconnect();
                sources.forEach((source: AudioBufferSourceNode) => source.stop());
                return;
            }
            const end: number = context.currentTime + SoundEngine.LOOP_FADE;
            fade.gain.setValueAtTime(1, context.currentTime);
            fade.gain.linearRampToValueAtTime(0, end);
            sources.forEach((source: AudioBufferSourceNode) => source.stop(end));
        };
    }

    /** Plays the file of a sound, of no category: SoundService.playFile() */
    public playFile(url: string, delay: number): Promise<void> {
        return this.playFileInto(url, delay);
    }

    /** Plays a file into its category, else into the output */
    private async playFileInto(url: string, delay: number, category?: SoundCategory): Promise<void> {
        const asked: Audio | undefined = this.gate.playing(category);
        if (asked === undefined) {
            return;
        }
        // Asked as the audio resumes: played once decoded, unless the audio is suspended again meanwhile
        const resuming: boolean = asked.context.state !== 'running';

        const buffer: AudioBuffer = await this.decodedFile(url);
        // Muted meanwhile, or the audio suspended: the sound is dropped
        const audio: Audio | undefined = resuming && this.gate.resumed(category) ? asked : this.gate.playing(category);
        if (audio !== undefined) {
            const source: AudioBufferSourceNode = audio.context.createBufferSource();
            source.buffer = buffer;
            source.connect(category === undefined ? audio.output : audio.categories[category]);
            source.start(audio.context.currentTime + delay);
        }
    }

    private decodedFile(url: string): Promise<AudioBuffer> {
        let decoded: Promise<AudioBuffer> | undefined = this.files.get(url);
        if (decoded === undefined) {
            const loaded: Promise<ArrayBuffer> = firstValueFrom(this.http.get(url, { responseType: 'arraybuffer' }));
            // A file failing to load is loaded again the next time; a file the browser can not decode is not asked again
            loaded.catch(() => this.files.delete(url));
            decoded = loaded.then((data: ArrayBuffer) => this.audio.context.decodeAudioData(data));
            this.files.set(url, decoded);
        }
        return decoded;
    }
}
