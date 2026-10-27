import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { TestHelper } from '@testing/test.helper';
import { describe, expect, test, vi } from 'vitest';
import { leaveMatchGuard, MatchPage } from './leave-match.guard';
import { MatchLeaveWarning } from './match-leave-warning';

describe('leaveMatchGuard', () => {
    function leave(page: MatchPage | null): boolean | Promise<boolean> {
        const state: RouterStateSnapshot = TestHelper.cast<RouterStateSnapshot>({});
        return TestBed.runInInjectionContext(() => leaveMatchGuard(TestHelper.cast<MatchPage>(page), TestHelper.cast<ActivatedRouteSnapshot>({}), state, state) as boolean | Promise<boolean>);
    }

    test('should let the page be left without page', () => {
        // Its outlet not activated
        expect(leave(null)).toBe(true);
    });

    test.each([true, false])('should let the page of a game be left once its player confirms leaving its match: %s', async (confirmed: boolean) => {
        // Given
        const confirmLeave = vi.fn().mockResolvedValue(confirmed);

        // When, Then
        await expect(leave({ leaveWarning: TestHelper.cast<MatchLeaveWarning>({ confirmLeave }) })).resolves.toBe(confirmed);
        expect(confirmLeave).toHaveBeenCalledOnce();
    });
});
