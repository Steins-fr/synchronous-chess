import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SoundCategory } from '@app/services/sound/enums/sound-category.enum';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SoundService } from '@app/services/sound/sound.service';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SoundLabPage } from './sound-lab.page';

describe('SoundLabPage', () => {
    let fixture: ComponentFixture<SoundLabPage>;
    let soundService: SoundService;

    function soundRow(effect: SoundEffect): HTMLElement {
        return fixture.nativeElement.querySelector(`#sound-${ effect }`);
    }

    function buttons(effect: SoundEffect): HTMLButtonElement[] {
        return [...soundRow(effect).querySelectorAll('button')];
    }

    function buttonTexts(effect: SoundEffect): string[] {
        return buttons(effect).map((button: HTMLButtonElement) => button.textContent.trim());
    }

    beforeEach(async () => {
        localStorage.clear();
        soundService = TestBed.inject(SoundService);
        fixture = TestBed.createComponent(SoundLabPage);
        await fixture.whenStable();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    test('should list every sound of the games, by game', () => {
        // Then
        expect([...fixture.nativeElement.querySelectorAll('h2')].map((title: HTMLElement) => title.textContent.trim())).toEqual([
            'Synchronous chess', 'Seventeen Poker', 'Russian roulette', 'Every game', 'Chat and rooms',
        ]);
        Object.values(SoundEffect).forEach((effect: SoundEffect) => expect(soundRow(effect)).not.toBeNull());
        expect(soundRow(SoundEffect.CHAT_MESSAGE).textContent).toContain('A message of another participant received unread, or while the page is hidden');
    });

    test('should play the sound synthesized', () => {
        // Given
        const play = vi.spyOn(soundService, 'play');

        // When
        buttons(SoundEffect.CHESS_CAPTURE)[0].click();

        // Then
        expect(buttonTexts(SoundEffect.CHESS_CAPTURE)).toEqual(['graphic_eq Synthesized']);
        expect(play).toHaveBeenCalledExactlyOnceWith(SoundEffect.CHESS_CAPTURE);
    });

    test('should play the file of a sound the game plays from a file', () => {
        // Given
        const playFile = vi.spyOn(soundService, 'playFile').mockResolvedValue();

        // When
        buttons(SoundEffect.POKER_SHUFFLE)[0].click();

        // Then
        expect(buttonTexts(SoundEffect.POKER_SHUFFLE)).toEqual(['audio_file card-shuffle.wav']);
        expect(buttonTexts(SoundEffect.ROULETTE_BULLET)).toEqual([1, 2, 3, 4, 5].map((take: number) => `audio_file bullet-${ take }.wav`));
        expect(playFile).toHaveBeenCalledExactlyOnceWith('assets/sounds/card-shuffle.wav');
    });

    test('should loop a sound until its button stops it, or the page is left', async () => {
        // Given
        const stop = vi.fn();
        const loop = vi.spyOn(soundService, 'loop').mockReturnValue(stop);
        expect(buttonTexts(SoundEffect.ROULETTE_SPIN)).toEqual(['repeat spin-start.wav, then spin-idle.wav looping']);

        // When
        buttons(SoundEffect.ROULETTE_SPIN)[0].click();
        await fixture.whenStable();

        // Then
        expect(loop).toHaveBeenCalledExactlyOnceWith(SoundEffect.ROULETTE_SPIN);
        expect(buttonTexts(SoundEffect.ROULETTE_SPIN)).toEqual(['stop spin-start.wav, then spin-idle.wav looping']);

        // When
        buttons(SoundEffect.ROULETTE_SPIN)[0].click();
        await fixture.whenStable();

        // Then
        expect(stop).toHaveBeenCalledOnce();
        expect(buttonTexts(SoundEffect.ROULETTE_SPIN)[0]).toMatch(/^repeat /);

        // When it loops again, then the page is left
        buttons(SoundEffect.ROULETTE_SPIN)[0].click();
        fixture.destroy();

        // Then
        expect(stop).toHaveBeenCalledTimes(2);
    });

    test('should tell a file that failed to load', async () => {
        // Given
        vi.spyOn(soundService, 'playFile').mockRejectedValue(new Error('Not Found'));

        // When
        buttons(SoundEffect.POKER_SHUFFLE)[0].click();
        buttons(SoundEffect.POKER_SHUFFLE)[0].click();
        await fixture.whenStable();

        // Then
        expect(soundRow(SoundEffect.POKER_SHUFFLE).textContent).toContain('card-shuffle.wav failed to load');
    });

    test('should tell the sounds are muted, all of them or the ones of a category', async () => {
        // Then
        expect(fixture.nativeElement.querySelector('#muted-note')).toBeNull();

        // When
        soundService.setMuted(true);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('#muted-note')?.textContent).toContain('The sounds are muted');

        // When
        soundService.setMuted(false);
        soundService.setCategoryMuted(SoundCategory.GAME, true);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('#muted-note')?.textContent).toContain('The sounds of the game are muted');

        // When
        soundService.setCategoryMuted(SoundCategory.CHAT, true);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('#muted-note')?.textContent).toContain('The sounds of the game and of the chat are muted');
    });
});
