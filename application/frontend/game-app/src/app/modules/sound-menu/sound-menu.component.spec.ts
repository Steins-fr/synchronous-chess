import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SoundCategory } from '@app/services/sound/enums/sound-category.enum';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SoundService } from '@app/services/sound/sound.service';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SoundMenuComponent } from './sound-menu.component';

describe('SoundMenuComponent', () => {
    let fixture: ComponentFixture<SoundMenuComponent>;
    let soundService: SoundService;

    function soundButton(): HTMLButtonElement {
        return fixture.nativeElement.querySelector('#sound-button');
    }

    // The panel, open in the overlay of the page
    function panel(): HTMLElement | null {
        return document.querySelector('#sound-panel');
    }

    function muteToggle(): HTMLButtonElement {
        return document.querySelector('#sound-panel mat-slide-toggle button') as HTMLButtonElement;
    }

    function volumeInput(): HTMLInputElement {
        return document.querySelector('#sound-panel input[matSliderThumb]') as HTMLInputElement;
    }

    async function openPanel(): Promise<void> {
        soundButton().click();
        await fixture.whenStable();
    }

    beforeEach(async () => {
        localStorage.clear();
        soundService = TestBed.inject(SoundService);
        fixture = TestBed.createComponent(SoundMenuComponent);
        await fixture.whenStable();
    });

    afterEach(() => {
        fixture.destroy();
        vi.restoreAllMocks();
        localStorage.clear();
    });

    test('should name its button, closed', () => {
        expect(soundButton().getAttribute('aria-label')).toBe('Sound effects');
        expect(soundButton().getAttribute('aria-expanded')).toBe('false');
        expect(panel()).toBeNull();
    });

    test.each<[string, number, boolean, string]>([
        ['a high volume', 60, false, 'volume_up'],
        ['a low volume', 30, false, 'volume_down'],
        ['no volume', 0, false, 'volume_off'],
        ['the sounds muted', 60, true, 'volume_off'],
    ])('should tell %s by its icon', async (_case: string, volume: number, muted: boolean, icon: string) => {
        // When
        soundService.setVolume(volume);
        soundService.setMuted(muted);
        await fixture.whenStable();

        // Then
        expect(soundButton().textContent.trim()).toBe(icon);
    });

    test('should tell every sound muted by its icon once the game and the chat are muted', async () => {
        // When
        soundService.setCategoryMuted(SoundCategory.GAME, true);
        soundService.setCategoryMuted(SoundCategory.CHAT, true);
        await fixture.whenStable();

        // Then
        expect(soundButton().textContent.trim()).toBe('volume_off');
    });

    test('should open a panel with the volume and the mute', async () => {
        // Given
        soundService.setMuted(true);

        // When
        await openPanel();

        // Then
        expect(soundButton().getAttribute('aria-expanded')).toBe('true');
        expect(panel()?.tagName).toBe('DIALOG');
        expect(panel()?.getAttribute('aria-label')).toBe('Sound effects');
        expect(panel()?.textContent).toContain('Mute');
        expect(muteToggle().getAttribute('aria-checked')).toBe('true');
        expect(document.querySelector(`#${ volumeInput().getAttribute('aria-labelledby') }`)?.textContent.trim()).toBe('Volume');
        expect(volumeInput().value).toBe('60');
    });

    test('should mute the sounds, then unmute them', async () => {
        // Given
        await openPanel();

        // When
        muteToggle().click();
        await fixture.whenStable();

        // Then
        expect(soundService.muted()).toBe(true);
        expect(soundButton().textContent.trim()).toBe('volume_off');

        // When
        muteToggle().click();
        await fixture.whenStable();

        // Then
        expect(soundService.muted()).toBe(false);
    });

    test('should mute the sounds of the game or of the chat alone, then unmute them', async () => {
        // Given
        await openPanel();
        const toggles: HTMLElement[] = Array.from(document.querySelectorAll('#sound-panel mat-slide-toggle'));
        const toggle = (label: string): HTMLButtonElement =>
            toggles.find((candidate: HTMLElement) => candidate.textContent.trim() === label)?.querySelector('button') as HTMLButtonElement;

        // When
        toggle('Mute the game').click();
        toggle('Mute the chat').click();
        await fixture.whenStable();

        // Then: the mute of every sound left off, the icon telling nothing is heard
        expect(soundService.categoryMuted(SoundCategory.GAME)).toBe(true);
        expect(soundService.categoryMuted(SoundCategory.CHAT)).toBe(true);
        expect(soundService.muted()).toBe(false);
        expect(toggle('Mute the chat').getAttribute('aria-checked')).toBe('true');
        expect(soundButton().textContent.trim()).toBe('volume_off');

        // When
        toggle('Mute the chat').click();
        await fixture.whenStable();

        // Then
        expect(soundService.categoryMuted(SoundCategory.CHAT)).toBe(false);
        expect(soundService.categoryMuted(SoundCategory.GAME)).toBe(true);
    });

    test('should set the volume, and let the user hear it once set', async () => {
        // Given
        const play = vi.spyOn(soundService, 'play');
        await openPanel();

        // When
        volumeInput().value = '25';
        volumeInput().dispatchEvent(new Event('input'));
        volumeInput().dispatchEvent(new Event('change'));
        await fixture.whenStable();

        // Then
        expect(soundService.volume()).toBe(25);
        expect(play).toHaveBeenCalledExactlyOnceWith(SoundEffect.CHESS_MOVE);
        expect(soundButton().textContent.trim()).toBe('volume_down');

        // When the game is muted
        soundService.setCategoryMuted(SoundCategory.GAME, true);
        volumeInput().dispatchEvent(new Event('change'));

        // Then: a sound of the chat
        expect(play).toHaveBeenLastCalledWith(SoundEffect.CHAT_MESSAGE);
    });

    test('should close on Escape only', async () => {
        // Given
        await openPanel();

        // When
        panel()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        await fixture.whenStable();

        // Then
        expect(panel()).not.toBeNull();

        // When
        panel()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await fixture.whenStable();

        // Then
        expect(panel()).toBeNull();
        expect(soundButton().getAttribute('aria-expanded')).toBe('false');
    });

    test('should close on a click out of it', async () => {
        // Given
        await openPanel();

        // When
        (document.querySelector('.cdk-overlay-backdrop') as HTMLElement).click();
        await fixture.whenStable();

        // Then
        expect(panel()).toBeNull();
    });

    test('should close on a second click of its button', async () => {
        // Given
        await openPanel();

        // When
        await openPanel();

        // Then
        expect(panel()).toBeNull();
    });
});
