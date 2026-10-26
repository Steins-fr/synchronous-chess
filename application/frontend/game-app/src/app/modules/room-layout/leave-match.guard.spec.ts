import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { DialogService } from '@app/services/dialog/dialog.service';
import { TestHelper } from '@testing/test.helper';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { leaveMatchGuard, MatchPage } from './leave-match.guard';
import { MatchLeaveWarning } from './match-leave-warning';

describe('leaveMatchGuard', () => {
    let dialogService: DialogService;

    beforeEach(() => {
        dialogService = TestHelper.cast<DialogService>({ confirm: vi.fn() });
        TestBed.configureTestingModule({ providers: [{ provide: DialogService, useValue: dialogService }] });
    });

    function leave(inMatch: boolean): boolean | Promise<boolean> {
        const page: MatchPage = { leaveWarning: TestHelper.cast<MatchLeaveWarning>({ inMatch: signal(inMatch) }) };
        const state: RouterStateSnapshot = TestHelper.cast<RouterStateSnapshot>({});
        return TestBed.runInInjectionContext(() => leaveMatchGuard(page, TestHelper.cast<ActivatedRouteSnapshot>({}), state, state) as boolean | Promise<boolean>);
    }

    test('should let the page of a game be left without a match of its player', () => {
        expect(leave(false)).toBe(true);
        expect(dialogService.confirm).not.toHaveBeenCalled();
    });

    test.each([true, false])('should ask to confirm leaving a match the player plays: %s', async (confirmed: boolean) => {
        // Given
        vi.mocked(dialogService.confirm).mockResolvedValue(confirmed);

        // When, Then
        await expect(leave(true)).resolves.toBe(confirmed);
        expect(dialogService.confirm).toHaveBeenCalledExactlyOnceWith('rooms.leave.title', 'rooms.leave.message', 'confirm-cancel');
    });
});
