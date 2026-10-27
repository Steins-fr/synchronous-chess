import { CanDeactivateFn } from '@angular/router';
import { MatchLeaveWarning } from './match-leave-warning';

/** The page of a game: it tells whether its local player plays a match */
export interface MatchPage {
    readonly leaveWarning: MatchLeaveWarning;
}

/**
 * A navigation of the app leaving the page of a match the local player plays (a link of the toolbar, back) asks it to
 * confirm (MatchLeaveWarning.confirmLeave()). Without page (its outlet not activated), nothing to confirm
 */
export const leaveMatchGuard: CanDeactivateFn<MatchPage> = (page: MatchPage | null): boolean | Promise<boolean> =>
    page === null || page.leaveWarning.confirmLeave();
