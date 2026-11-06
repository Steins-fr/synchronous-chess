import { Signal, signal } from '@angular/core';
import { PlayedCommitRevealGame } from '@app/modules/commit-reveal/classes/played-commit-reveal-game';
import { SeatedPlayer } from '@app/modules/game-table/classes/table-seats';
import { ContrabandGameState } from '../rules/contraband-game-state';
import { ContrabandSetup } from '../rules/contraband-rules';

/**
 * A match of the room, from its start: its players, its countries and its setup, the draw of its seed, then the match
 * itself. Its players are the North ones first.
 */
export class PlayedContrabandGame extends PlayedCommitRevealGame<ContrabandGameState, ContrabandSetup> {
    private readonly _north = signal<number>(0);
    /** The players of each country: none until it starts */
    public readonly north: Signal<number> = this._north.asReadonly();

    /** The match starts: its players, its countries and its setup are final, they draw its seed */
    public openMatch(players: ReadonlyArray<Readonly<SeatedPlayer>>, north: number, setup: Readonly<ContrabandSetup>): void {
        this._north.set(north);
        this.open(players, setup);
    }
}
