import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { DialogService } from '@app/services/dialog/dialog.service';
import { MatchLeaveWarning } from './match-leave-warning';

/** The page of a game: it tells whether its local player plays a match */
export interface MatchPage {
    readonly leaveWarning: MatchLeaveWarning;
}

/**
 * Leaving the match the local player plays asks it to confirm: its seat then follows the one of a closed tab, freed once
 * the player is away. Out of a match, nothing to confirm
 * @returns whether the player leaves
 */
export function confirmMatchLeave(warning: MatchLeaveWarning, dialogService: DialogService): boolean | Promise<boolean> {
    return !warning.inMatch() || dialogService.confirm(marker('rooms.leave.title'), marker('rooms.leave.message'), 'confirm-cancel');
}

/**
 * A navigation of the app leaving the page of a match the local player plays (a link of the toolbar, back) asks it to
 * confirm (confirmMatchLeave()). Without page (its outlet not activated), nothing to confirm
 */
export const leaveMatchGuard: CanDeactivateFn<MatchPage> = (page: MatchPage | null): boolean | Promise<boolean> =>
    page === null || confirmMatchLeave(page.leaveWarning, inject(DialogService));
