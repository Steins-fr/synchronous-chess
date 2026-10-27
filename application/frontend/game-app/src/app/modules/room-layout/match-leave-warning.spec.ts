import { Component, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogService } from '@app/services/dialog/dialog.service';
import { TestHelper } from '@testing/test.helper';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MatchLeaveWarning } from './match-leave-warning';

@Component({ template: '' })
class GameComponent {
    public readonly inMatch: WritableSignal<boolean> = signal(false);

    public constructor() {
        TestBed.inject(MatchLeaveWarning).watch(this.inMatch);
    }
}

describe('MatchLeaveWarning', () => {
    let warning: MatchLeaveWarning;
    let dialogService: DialogService;

    beforeEach(() => {
        dialogService = TestHelper.cast<DialogService>({ confirm: vi.fn() });
        TestBed.configureTestingModule({ providers: [MatchLeaveWarning, { provide: DialogService, useValue: dialogService }] });
        warning = TestBed.inject(MatchLeaveWarning);
    });

    /** Whether the page asked the browser to confirm its unload, its effects run */
    function unloadPrevented(): boolean {
        TestBed.tick();
        const event: Event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
    }

    test('should let the player leave at once out of a match', () => {
        // Given
        const game = TestBed.createComponent(GameComponent);
        game.componentInstance.inMatch.set(false);

        // When, Then
        expect(warning.confirmLeave()).toBe(true);
        expect(dialogService.confirm).not.toHaveBeenCalled();
    });

    test.each([true, false])('should ask to confirm leaving the match the player plays: %s', async (confirmed: boolean) => {
        // Given
        const game = TestBed.createComponent(GameComponent);
        game.componentInstance.inMatch.set(true);
        vi.mocked(dialogService.confirm).mockResolvedValue(confirmed);

        // When, Then
        await expect(warning.confirmLeave()).resolves.toBe(confirmed);
        expect(dialogService.confirm).toHaveBeenCalledExactlyOnceWith('rooms.leave.title', 'rooms.leave.message', 'confirm-cancel');
    });

    test('should not warn without a match', () => {
        expect(warning.inMatch()).toBe(false);
        expect(unloadPrevented()).toBe(false);
    });

    test('should ask the browser to confirm the unload while the local player plays the match of the page', () => {
        // Given
        const game = TestBed.createComponent(GameComponent);

        // When, Then
        expect(unloadPrevented()).toBe(false);
        game.componentInstance.inMatch.set(true);
        expect(warning.inMatch()).toBe(true);
        expect(unloadPrevented()).toBe(true);
        game.componentInstance.inMatch.set(false);
        expect(unloadPrevented()).toBe(false);
    });

    test('should forget the match of a component destroyed, not the one of the next', () => {
        // Given
        const former = TestBed.createComponent(GameComponent);
        former.componentInstance.inMatch.set(true);
        const next = TestBed.createComponent(GameComponent);
        next.componentInstance.inMatch.set(true);

        // When
        former.destroy();

        // Then
        expect(warning.inMatch()).toBe(true);

        // When
        next.destroy();

        // Then
        expect(warning.inMatch()).toBe(false);
    });

    test('should stop listening once destroyed', () => {
        // Given
        const game = TestBed.createComponent(GameComponent);
        game.componentInstance.inMatch.set(true);

        expect(unloadPrevented()).toBe(true);

        // When
        TestBed.resetTestingModule();

        // Then
        const event: Event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
    });
});
