import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AudioBufferSourceNodeMock, AudioContextMock, AudioNodeMock, GainNodeMock, OscillatorNodeMock } from '@testing/audio-context.mock';
import { TestHelper } from '@testing/test.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SoundEffect } from './enums/sound-effect.enum';
import { SoundCategory } from './enums/sound-category.enum';
import { SoundState } from './enums/sound-state.enum';
import { isFileSound, isLoopSound, SynthesizedSoundEffect } from './sound-files';
import { SoundService } from './sound.service';

describe('SoundService', () => {
    const activations: string[] = ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click'];

    function createService(): SoundService {
        vi.spyOn(document, 'addEventListener');
        return TestBed.inject(SoundService);
    }

    /**
     * Runs the listener of a gesture of the service with an event of a person (trusted), or of a script: jsdom trusts no
     * event the code dispatches, and never lets a spec trust one. Then lets the audio resume, and its synthesizer load
     */
    async function act(type: string = 'pointerdown', isTrusted: boolean = true): Promise<void> {
        const call = vi.mocked(document.addEventListener).mock.calls.find(([listened]: Parameters<Document['addEventListener']>) => listened === type);
        (call?.[1] as (event: Event) => void)({ isTrusted } as Event);
        // The synthesizer, loaded once the audio starts
        await vi.dynamicImportSettled();
    }

    function context(): AudioContextMock {
        return AudioContextMock.latest() as AudioContextMock;
    }

    function output(): GainNodeMock {
        return context().gains[0];
    }

    beforeEach(() => {
        localStorage.clear();
        AudioContextMock.install();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        localStorage.clear();
    });

    test('should play no sound, and start no audio, before a gesture of a person', async () => {
        // Given
        const service: SoundService = createService();

        // When
        service.play(SoundEffect.CHESS_MOVE);
        await service.playFile('assets/sounds/card-shuffle.wav');
        await act('pointerdown', false);

        // Then
        expect(AudioContextMock.instances).toHaveLength(0);
        TestBed.inject(HttpTestingController).expectNone('assets/sounds/card-shuffle.wav');
    });

    test.each(activations)('should start the audio at a %s of a person, on the volume of the sounds', async (type: string) => {
        // Given
        const service: SoundService = createService();

        // When
        await act(type);
        service.play(SoundEffect.CHESS_MOVE);

        // Then
        expect(AudioContextMock.instances).toHaveLength(1);
        expect(context().state).toBe('running');
        expect(output().connections).toEqual([context().destination]);
        expect(output().gain.value).toBeCloseTo(0.36);
        expect(context().sources.filter((source) => source instanceof OscillatorNodeMock)).not.toHaveLength(0);
    });

    test('should keep its audio, resumed at the next gesture once the browser suspended it', async () => {
        // Given
        createService();
        await act();
        context().state = 'suspended';

        // When
        await act('keydown');
        await act('click');

        // Then
        expect(AudioContextMock.instances).toHaveLength(1);
        expect(context().resume).toHaveBeenCalledTimes(2);
        expect(context().state).toBe('running');
    });

    test('should play no sound while the audio is suspended', async () => {
        // Given
        const service: SoundService = createService();
        await act();
        context().state = 'suspended';
        context().resume.mockRejectedValue(new DOMException('Closed', 'InvalidStateError'));

        // When
        service.play(SoundEffect.CHESS_MOVE);
        await act();

        // Then
        expect(context().sources).toHaveLength(0);
    });

    test('should play no sound while its synthesizer loads, once the audio started', async () => {
        // Given
        const service: SoundService = createService();
        const call = vi.mocked(document.addEventListener).mock.calls.find(([listened]: Parameters<Document['addEventListener']>) => listened === 'click');
        (call?.[1] as (event: Event) => void)({ isTrusted: true } as Event);
        await Promise.resolve();

        // When
        service.play(SoundEffect.CHESS_MOVE);

        // Then
        expect(context().state).toBe('running');
        expect(context().sources).toHaveLength(0);
        await vi.dynamicImportSettled();
    });

    test('should play no sound in a browser without the Web Audio API', () => {
        // Given
        vi.stubGlobal('AudioContext', undefined);

        // When
        const service: SoundService = createService();
        service.play(SoundEffect.CHESS_MOVE);

        // Then
        expect(document.addEventListener).not.toHaveBeenCalled();
    });

    test('should stop listening to the gestures once destroyed', () => {
        // Given
        createService();
        const removeEventListener = vi.spyOn(document, 'removeEventListener');

        // When
        TestBed.resetTestingModule();

        // Then
        expect(removeEventListener.mock.calls.map(([type]: Parameters<Document['removeEventListener']>) => type)).toEqual(activations);
    });

    test.each(Object.values(SoundEffect).filter((effect: SoundEffect): effect is SynthesizedSoundEffect => !isFileSound(effect) && !isLoopSound(effect)))('should synthesize the sound %s, each part faded in then out', async (effect: SynthesizedSoundEffect) => {
        // Given
        const service: SoundService = createService();
        await act();

        // When
        service.play(effect);

        // Then
        expect(context().sources).not.toHaveLength(0);
        context().sources.forEach((source) => {
            const [from]: number[] = source.start.mock.calls[0];
            const [to]: number[] = source.stop.mock.calls[0];
            expect(to).toBeGreaterThan(from);
            expect(to).toBeLessThan(1);
        });
    });

    test('should play a sound later by its delay', async () => {
        // Given
        const service: SoundService = createService();
        await act();
        context().currentTime = 2;

        // When
        service.play(SoundEffect.CHESS_CHECK, 0.5);

        // Then
        expect(context().sources[0].start).toHaveBeenCalledExactlyOnceWith(2.5);
    });

    test('should synthesize the noise of its sounds once', async () => {
        // Given
        const service: SoundService = createService();
        await act();

        // When
        service.play(SoundEffect.CHESS_MOVE);
        service.play(SoundEffect.CHESS_MOVE);

        // Then
        const noises: AudioBufferSourceNodeMock[] = context().sources.filter((source) => source instanceof AudioBufferSourceNodeMock);
        expect(noises).toHaveLength(2);
        expect(noises[0].buffer).toBe(noises[1].buffer);
        expect(noises[0].loop).toBe(true);
    });

    test('should play the file of a sound, loaded once', async () => {
        // Given
        const service: SoundService = createService();
        const http: HttpTestingController = TestBed.inject(HttpTestingController);
        await act();

        // When
        const played: Promise<void> = service.playFile('assets/sounds/card-shuffle.wav');
        http.expectOne('assets/sounds/card-shuffle.wav').flush(new ArrayBuffer(8));
        await played;
        await service.playFile('assets/sounds/card-shuffle.wav');

        // Then
        http.verify();
        expect(context().decodeAudioData).toHaveBeenCalledOnce();
        const files: AudioBufferSourceNodeMock[] = context().sources.filter((source) => source instanceof AudioBufferSourceNodeMock);
        expect(files).toHaveLength(2);
        expect(files[0].buffer).toBe(files[1].buffer);
        expect(files[0].connections).toEqual([output()]);
        expect(files[0].start).toHaveBeenCalledOnce();
    });

    test('should play a sound from its file, later by its delay once decoded, nothing when it fails to load', async () => {
        // Given
        const service: SoundService = createService();
        const http: HttpTestingController = TestBed.inject(HttpTestingController);
        await act();
        context().currentTime = 2;

        // When
        service.play(SoundEffect.POKER_FOLD, 0.5);
        service.play(SoundEffect.POKER_SHUFFLE);
        http.expectOne('assets/sounds/card-shuffle.wav').flush(new ArrayBuffer(0), { status: 404, statusText: 'Not Found' });
        http.expectOne('assets/sounds/card-shove-1.wav').flush(new ArrayBuffer(8));
        await vi.waitFor(() => expect(context().sources).toHaveLength(1));

        // Then
        http.verify();
        expect(context().sources[0].start).toHaveBeenCalledExactlyOnceWith(2.5);
    });

    test('should play a sound of several files from one of them at random', async () => {
        // Given
        const service: SoundService = createService();
        const http: HttpTestingController = TestBed.inject(HttpTestingController);
        await act();
        const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
            (array as unknown as Uint32Array)[0] = 7;
            return array;
        });

        // When
        service.play(SoundEffect.ROULETTE_BULLET);

        // Then: the 3rd of the 5 files
        expect(random).toHaveBeenCalledOnce();
        http.expectOne('assets/sounds/bullet-3.wav');
    });

    test('should play the start of a sound looping, then its loop right after it, until stopped, fading out', async () => {
        // Given
        const service: SoundService = createService();
        const http: HttpTestingController = TestBed.inject(HttpTestingController);
        await act();
        context().currentTime = 1;

        // When: a start of 0.8 second
        const stop: () => void = service.loop(SoundEffect.ROULETTE_SPIN);
        http.expectOne('assets/sounds/spin-start.wav').flush(new ArrayBuffer(38_400));
        http.expectOne('assets/sounds/spin-idle.wav').flush(new ArrayBuffer(57_600));
        await vi.waitFor(() => expect(context().sources).toHaveLength(2));

        // Then: into the sounds of the game, after the output and the gains of the categories
        const [start, loop] = context().sources as AudioBufferSourceNodeMock[];
        const fade: GainNodeMock = context().gains[3];
        expect(start.loop).toBe(false);
        expect(start.start).toHaveBeenCalledExactlyOnceWith(1);
        expect(loop.loop).toBe(true);
        expect(loop.start).toHaveBeenCalledExactlyOnceWith(1.8);
        expect(start.connections).toEqual([fade]);
        expect(loop.connections).toEqual([fade]);
        expect(fade.connections).toEqual([context().gains[1]]);
        expect(context().gains[1].connections).toEqual([output()]);

        // When
        context().currentTime = 5;
        stop();
        stop();

        // Then
        expect(fade.gain.linearRampToValueAtTime).toHaveBeenCalledExactlyOnceWith(0, 5 + SoundService.LOOP_FADE);
        expect(start.stop).toHaveBeenCalledExactlyOnceWith(5 + SoundService.LOOP_FADE);
        expect(loop.stop).toHaveBeenCalledExactlyOnceWith(5 + SoundService.LOOP_FADE);
    });

    test('should loop no sound before the audio starts, once stopped while its files load, nor when they fail to load', async () => {
        // Given
        const service: SoundService = createService();
        const http: HttpTestingController = TestBed.inject(HttpTestingController);

        // When, Then: no audio yet
        service.loop(SoundEffect.ROULETTE_SPIN)();
        http.expectNone('assets/sounds/spin-start.wav');

        // When: a file failing to load
        await act();
        service.loop(SoundEffect.ROULETTE_SPIN);
        http.expectOne('assets/sounds/spin-start.wav').flush(new ArrayBuffer(0), { status: 404, statusText: 'Not Found' });
        http.expectOne('assets/sounds/spin-idle.wav').flush(new ArrayBuffer(57_600));
        // The file failed, forgotten once its failure is seen
        await new Promise((resolve) => setTimeout(resolve));

        // When: stopped before its files are loaded
        const stop: () => void = service.loop(SoundEffect.ROULETTE_SPIN);
        stop();
        http.expectOne('assets/sounds/spin-start.wav').flush(new ArrayBuffer(38_400));
        await vi.waitFor(() => expect(context().decodeAudioData).toHaveBeenCalledTimes(2));

        // Then
        expect(context().sources).toEqual([]);
    });

    test('should set the volume of the sounds playing as it changes, muted too', async () => {
        // Given
        const service: SoundService = createService();
        await act();
        service.setVolume(50);
        TestBed.tick();

        // Then
        expect(output().gain.value).toBe(0.25);

        // When
        service.setMuted(true);
        TestBed.tick();

        // Then
        expect(output().gain.value).toBe(0);
    });

    test('should load the file of a sound again once its loading failed', async () => {
        // Given
        const service: SoundService = createService();
        const http: HttpTestingController = TestBed.inject(HttpTestingController);
        await act();
        const failed: Promise<void> = service.playFile('assets/sounds/missing.wav');
        http.expectOne('assets/sounds/missing.wav').flush(new ArrayBuffer(0), { status: 404, statusText: 'Not Found' });
        await expect(failed).rejects.toThrow();

        // When
        const played: Promise<void> = service.playFile('assets/sounds/missing.wav');
        http.expectOne('assets/sounds/missing.wav').flush(new ArrayBuffer(8));
        await played;

        // Then
        expect(context().sources).toHaveLength(1);
    });

    test('should not play a file once muted while it loaded', async () => {
        // Given
        const service: SoundService = createService();
        const http: HttpTestingController = TestBed.inject(HttpTestingController);
        await act();
        const played: Promise<void> = service.playFile('assets/sounds/card-shuffle.wav');

        // When
        service.setMuted(true);
        http.expectOne('assets/sounds/card-shuffle.wav').flush(new ArrayBuffer(8));
        await played;

        // Then
        expect(context().sources).toHaveLength(0);
    });

    test('should play the sounds at the volume set, and keep it', async () => {
        // Given
        const service: SoundService = createService();
        await act();

        // When
        service.setVolume(50);
        service.play(SoundEffect.CHESS_MOVE);

        // Then
        expect(service.volume()).toBe(50);
        expect(output().gain.value).toBeCloseTo(0.25);
        expect(localStorage.getItem(SoundService.volumeKey)).toBe('50');
    });

    test('should play no sound at a volume of 0', async () => {
        // Given
        const service: SoundService = createService();
        await act();

        // When
        service.setVolume(0);
        service.play(SoundEffect.CHESS_MOVE);

        // Then
        expect(context().sources).toHaveLength(0);
    });

    test('should play no sound once muted, keeping the volume, and play again once unmuted', async () => {
        // Given
        const service: SoundService = createService();
        await act();

        // When
        service.setMuted(true);
        service.play(SoundEffect.CHESS_MOVE);

        // Then
        expect(service.muted()).toBe(true);
        expect(service.volume()).toBe(SoundService.DEFAULT_VOLUME);
        expect(localStorage.getItem(SoundService.stateKey)).toBe(SoundState.MUTED);
        expect(context().sources).toHaveLength(0);

        // When
        service.setMuted(false);
        service.play(SoundEffect.CHESS_MOVE);

        // Then
        expect(localStorage.getItem(SoundService.stateKey)).toBe(SoundState.ON);
        expect(context().sources).not.toHaveLength(0);
    });

    test('should start the audio at the volume and the mutes kept, suspended while every sound is muted', async () => {
        // Given: every sound muted, the game too, in a former visit
        localStorage.setItem(SoundService.stateKey, SoundState.MUTED);
        localStorage.setItem(SoundService.categoryKeys[SoundCategory.GAME], SoundState.MUTED);
        const service: SoundService = createService();

        // When
        await act();
        const stop: () => void = service.loop(SoundEffect.ROULETTE_SPIN);
        stop();

        // Then: silent, the new audio suspended once, which a browser may start by itself, not resumed
        expect(output().gain.value).toBe(0);
        expect(context().gains[1].gain.value).toBe(0);
        expect(context().gains[2].gain.value).toBe(1);
        expect(context().resume).not.toHaveBeenCalled();
        expect(context().suspend).toHaveBeenCalledOnce();
        expect(context().state).toBe('suspended');
        expect(context().sources).toHaveLength(0);

        // When: another gesture
        await act('click');

        // Then: not suspended again
        expect(context().suspend).toHaveBeenCalledOnce();

        // When
        service.setMuted(false);
        TestBed.tick();

        // Then
        expect(context().state).toBe('running');
        expect(output().gain.value).toBeCloseTo(0.36);

        // When muted again, the browser refusing to suspend the audio
        context().suspend.mockRejectedValueOnce(new DOMException('Closed', 'InvalidStateError'));
        service.setMuted(true);
        TestBed.tick();

        // Then: silent all the same
        expect(output().gain.value).toBe(0);
    });

    test('should play the sound asked as the volume unmutes the sounds, while the audio resumes', async () => {
        // Given: muted, the audio suspended, the browser resuming it a moment later
        localStorage.setItem(SoundService.stateKey, SoundState.MUTED);
        const service: SoundService = createService();
        await act();
        context().resume.mockImplementationOnce((): Promise<void> => new Promise((resolve) => setTimeout(() => {
            context().state = 'running';
            resolve();
        })));

        // When: the volume set, then its preview
        service.setVolume(50);
        service.play(SoundEffect.CHESS_MOVE);

        // Then: scheduled at once, heard once the audio runs
        expect(context().state).toBe('suspended');
        expect(context().sources).not.toHaveLength(0);
        await vi.waitFor(() => expect(context().state).toBe('running'));
    });

    test('should ask the resume again at each gesture while the browser keeps it pending, the sounds asked later dropped', async () => {
        // Given: a browser not letting the audio start, its resume pending
        const service: SoundService = createService();
        expect(service.started()).toBe(false);
        await act();
        expect(service.started()).toBe(true);
        context().state = 'suspended';
        context().resume.mockImplementation((): Promise<void> => new Promise<void>(() => undefined));

        // When: a sound asked in a later task, then a gesture
        await Promise.resolve();
        service.play(SoundEffect.CHESS_MOVE);
        await act('click');

        // Then: dropped, the resume asked again
        expect(context().sources).toHaveLength(0);
        expect(context().resume).toHaveBeenCalledTimes(2);
    });

    test('should play a file asked as the volume unmutes the sounds, once decoded, while the audio resumes', async () => {
        // Given: muted, the browser slow to resume the audio
        localStorage.setItem(SoundService.stateKey, SoundState.MUTED);
        const service: SoundService = createService();
        const http: HttpTestingController = TestBed.inject(HttpTestingController);
        await act();
        context().resume.mockImplementation((): Promise<void> => new Promise<void>(() => undefined));

        // When
        service.setVolume(50);
        service.play(SoundEffect.POKER_FOLD);
        http.expectOne('assets/sounds/card-shove-1.wav').flush(new ArrayBuffer(8));

        // Then: scheduled, the audio still resuming
        await vi.waitFor(() => expect(context().sources).toHaveLength(1));
        expect(context().state).toBe('suspended');
    });

    test('should stop a sound looping on a suspended audio at once, without a fade heard once it resumes', async () => {
        // Given: muted, a loop scheduled on the audio suspended
        localStorage.setItem(SoundService.stateKey, SoundState.MUTED);
        const service: SoundService = createService();
        const http: HttpTestingController = TestBed.inject(HttpTestingController);
        await act();
        const stop: () => void = service.loop(SoundEffect.ROULETTE_SPIN);
        http.expectOne('assets/sounds/spin-start.wav').flush(new ArrayBuffer(38_400));
        http.expectOne('assets/sounds/spin-idle.wav').flush(new ArrayBuffer(57_600));
        await vi.waitFor(() => expect(context().sources).toHaveLength(2));

        // When
        stop();

        // Then
        const fade: GainNodeMock = context().gains[3];
        expect(fade.disconnect).toHaveBeenCalledOnce();
        expect(fade.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
        context().sources.forEach((source) => expect(source.stop).toHaveBeenCalledExactlyOnceWith());
    });

    test('should wake an audio suspending for a file of no category', async () => {
        // Given: both categories muted as the audio runs, its suspend pending
        const service: SoundService = createService();
        const http: HttpTestingController = TestBed.inject(HttpTestingController);
        await act();
        context().suspend.mockImplementationOnce((): Promise<void> => new Promise<void>(() => undefined));
        service.setCategoryMuted(SoundCategory.GAME, true);
        service.setCategoryMuted(SoundCategory.CHAT, true);

        // When: a file of the sound lab
        const played: Promise<void> = service.playFile('assets/sounds/card-shuffle.wav');
        http.expectOne('assets/sounds/card-shuffle.wav').flush(new ArrayBuffer(8));
        await played;

        // Then: resumed after the suspend
        expect(context().resume.mock.invocationCallOrder.at(-1)).toBeGreaterThan(context().suspend.mock.invocationCallOrder[0]);
        expect(context().sources).toHaveLength(1);
    });

    test('should resume the audio unmuted while its suspend is pending', async () => {
        // Given: running, the browser suspending it a moment later
        const service: SoundService = createService();
        await act();
        context().suspend.mockImplementationOnce((): Promise<void> => new Promise<void>(() => undefined));

        // When: the volume set to 0, then at once to 5, the audio still running
        service.setVolume(0);
        service.setVolume(5);

        // Then: the resume asked after the suspend, which the audio settles in their order
        expect(context().state).toBe('running');
        expect(context().suspend).toHaveBeenCalledOnce();
        expect(context().resume).toHaveBeenCalledTimes(2);
        expect(context().resume.mock.invocationCallOrder[1]).toBeGreaterThan(context().suspend.mock.invocationCallOrder[0]);
    });

    test('should loop a sound while every sound is muted, heard once unmuted', async () => {
        // Given
        localStorage.setItem(SoundService.stateKey, SoundState.MUTED);
        const service: SoundService = createService();
        const http: HttpTestingController = TestBed.inject(HttpTestingController);
        await act();

        // When
        service.loop(SoundEffect.ROULETTE_SPIN);
        http.expectOne('assets/sounds/spin-start.wav').flush(new ArrayBuffer(38_400));
        http.expectOne('assets/sounds/spin-idle.wav').flush(new ArrayBuffer(57_600));
        await vi.waitFor(() => expect(context().sources).toHaveLength(2));
        service.setMuted(false);

        // Then: scheduled on the audio suspended, which resumes
        expect(context().state).toBe('running');
    });

    test('should load ahead the files of the sounds of a page, once the audio starts', async () => {
        // Given
        const service: SoundService = createService();
        const http: HttpTestingController = TestBed.inject(HttpTestingController);

        // When: before the audio, a file, a loop and a sound synthesized
        service.preload([SoundEffect.POKER_SHUFFLE, SoundEffect.ROULETTE_SPIN, SoundEffect.CHESS_MOVE]);

        // Then
        http.expectNone('assets/sounds/card-shuffle.wav');

        // When
        await act();
        ['card-shuffle.wav', 'spin-start.wav', 'spin-idle.wav'].forEach((file: string) => http.expectOne(`assets/sounds/${ file }`).flush(new ArrayBuffer(8)));
        service.preload([SoundEffect.POKER_FOLD]);
        // A file failing to load, loaded again when played
        http.expectOne('assets/sounds/card-shove-1.wav').flush(new ArrayBuffer(0), { status: 404, statusText: 'Not Found' });
        service.play(SoundEffect.POKER_SHUFFLE);

        // Then: loaded once, played at once
        http.verify();
        await vi.waitFor(() => expect(context().sources).toHaveLength(1));
    });

    test('should not start the audio on a gesture the browser does not count as an activation', () => {
        // Given
        vi.stubGlobal('navigator', { ...navigator, userActivation: { isActive: false } });
        createService();

        // When
        const call = vi.mocked(document.addEventListener).mock.calls.find(([listened]: Parameters<Document['addEventListener']>) => listened === 'pointerdown');
        (call?.[1] as (event: Event) => void)({ isTrusted: true } as Event);

        // Then
        expect(AudioContextMock.latest()).toBeUndefined();
    });

    test('should suspend the audio while both categories are muted, a file of no category waking it', async () => {
        // Given
        const service: SoundService = createService();
        const http: HttpTestingController = TestBed.inject(HttpTestingController);
        await act();

        // When
        service.setCategoryMuted(SoundCategory.GAME, true);
        service.setCategoryMuted(SoundCategory.CHAT, true);

        // Then
        expect(context().state).toBe('suspended');

        // When: a file of the sound lab
        const played: Promise<void> = service.playFile('assets/sounds/card-shuffle.wav');
        http.expectOne('assets/sounds/card-shuffle.wav').flush(new ArrayBuffer(8));
        await played;

        // Then
        expect(context().state).toBe('running');
        expect(context().sources).toHaveLength(1);
    });

    test('should load the synthesizer again at the next gesture once its loading failed', async () => {
        // Given
        const service: SoundService = createService();
        const importSynth = vi.spyOn(TestHelper.cast<{ importSynth(): Promise<unknown> }>(SoundService.prototype), 'importSynth')
            .mockRejectedValueOnce(new Error('Chunk lost'));

        // When
        await act();
        service.play(SoundEffect.CHESS_MOVE);

        // Then
        expect(context().sources).toHaveLength(0);

        // When
        await act();
        service.play(SoundEffect.CHESS_MOVE);

        // Then
        expect(importSynth).toHaveBeenCalledTimes(2);
        expect(context().sources).not.toHaveLength(0);
    });

    test('should not load again a file the browser can not decode', async () => {
        // Given
        const service: SoundService = createService();
        const http: HttpTestingController = TestBed.inject(HttpTestingController);
        await act();
        context().decodeAudioData.mockRejectedValueOnce(new Error('Unable to decode'));
        const failed: Promise<void> = service.playFile('assets/sounds/card-shuffle.wav');
        http.expectOne('assets/sounds/card-shuffle.wav').flush(new ArrayBuffer(8));
        await expect(failed).rejects.toThrow('Unable to decode');

        // When
        await expect(service.playFile('assets/sounds/card-shuffle.wav')).rejects.toThrow('Unable to decode');

        // Then
        http.verify();
        expect(context().decodeAudioData).toHaveBeenCalledOnce();
    });

    test('should unmute the sounds once the volume is set', () => {
        // Given
        const service: SoundService = createService();
        service.setMuted(true);

        // When
        service.setVolume(80);

        // Then
        expect(service.muted()).toBe(false);
    });

    test('should start with the volume kept, muted when it was', () => {
        // Given
        localStorage.setItem(SoundService.volumeKey, '30');
        localStorage.setItem(SoundService.stateKey, SoundState.MUTED);

        // When
        const service: SoundService = createService();

        // Then
        expect(service.volume()).toBe(30);
        expect(service.muted()).toBe(true);
    });

    test('should start on the default volume, the sounds playing, when nothing is kept', () => {
        // When
        const service: SoundService = createService();

        // Then
        expect(service.volume()).toBe(SoundService.DEFAULT_VOLUME);
        expect(service.muted()).toBe(false);
    });

    test('should follow the volume and the mutes set by another tab, or a storage cleared', () => {
        // Given
        const service: SoundService = createService();

        // When
        localStorage.setItem(SoundService.volumeKey, '20');
        window.dispatchEvent(new StorageEvent('storage', { key: SoundService.volumeKey }));
        localStorage.setItem(SoundService.stateKey, SoundState.MUTED);
        window.dispatchEvent(new StorageEvent('storage', { key: SoundService.stateKey }));
        localStorage.setItem(SoundService.categoryKeys[SoundCategory.CHAT], SoundState.MUTED);
        window.dispatchEvent(new StorageEvent('storage', { key: SoundService.categoryKeys[SoundCategory.CHAT] }));

        // Then
        expect(service.volume()).toBe(20);
        expect(service.muted()).toBe(true);
        expect(service.categoryMuted(SoundCategory.CHAT)).toBe(true);
        expect(service.categoryMuted(SoundCategory.GAME)).toBe(false);

        // When
        localStorage.clear();
        window.dispatchEvent(new StorageEvent('storage', { key: null }));

        // Then
        expect(service.volume()).toBe(SoundService.DEFAULT_VOLUME);
        expect(service.muted()).toBe(false);
        expect(service.categoryMuted(SoundCategory.CHAT)).toBe(false);
    });

    test('should mute the sounds of a category alone, those playing included, the mute kept', async () => {
        // Given: the chat muted before the audio starts
        const service: SoundService = createService();
        service.setCategoryMuted(SoundCategory.CHAT, true);
        await act();
        const [game, chat]: GainNodeMock[] = context().gains.slice(1, 3);

        // When
        service.play(SoundEffect.ROOM_JOIN);
        service.play(SoundEffect.CHESS_MOVE);

        // Then: the sound of the game alone, into its gain
        expect(localStorage.getItem(SoundService.categoryKeys[SoundCategory.CHAT])).toEqual(SoundState.MUTED);
        expect(chat.gain.value).toBe(0);
        expect(game.gain.value).toBe(1);
        expect(context().sources).not.toHaveLength(0);
        // Each source, through its filter and its envelope, to the gain of the game, then the output
        const path = (node: AudioNodeMock): AudioNodeMock[] => [node, ...node.connections.flatMap(path)];
        context().sources.forEach((source) => expect(path(source)).toContain(game));

        // When the game is muted too, then the chat played again
        service.setCategoryMuted(SoundCategory.GAME, true);
        service.setCategoryMuted(SoundCategory.CHAT, false);
        TestBed.tick();

        // Then
        expect(game.gain.value).toBe(0);
        expect(chat.gain.value).toBe(1);
        expect(service.categoryMuted(SoundCategory.GAME)).toBe(true);
        expect(localStorage.getItem(SoundService.categoryKeys[SoundCategory.CHAT])).toEqual(SoundState.ON);
    });
});
