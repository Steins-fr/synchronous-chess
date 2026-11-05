import { computed, Signal, signal } from '@angular/core';
import { DrawPhase, FairDraw } from '@app/modules/commit-reveal/classes/fair-draw';
import { SeatedPlayer } from '@app/modules/game-table/classes/table-seats';
import { ContrabandGameState } from '../rules/contraband-game-state';
import { ContrabandSetup } from '../rules/contraband-rules';
import { ContrabandResult } from '../rules/standings';

/**
 * A match of the room, from its start: its players, its countries and its setup, the draw of its seed, then the match
 * itself. Its id holds the salt of each player, drawn when it took its seat, the index of the match in the room and its
 * attempt: no commitment of a match in another room of the same name, nor of a former match of the room, is a
 * commitment of this one.
 */
export class PlayedContrabandGame {
    private readonly _players = signal<ReadonlyArray<Readonly<SeatedPlayer>>>([]);
    /** The players of the match, in the order of their seats, the North ones first: none until it starts */
    public readonly players: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> =>
        this._players().map((player: Readonly<SeatedPlayer>) => player.name));
    public readonly id: Signal<string> = computed((): string =>
        [...this._players().map((player: Readonly<SeatedPlayer>) => player.salt), this.index, this.attempt].join(':'));
    private readonly _north = signal<number>(0);
    /** The players of each country: none until it starts */
    public readonly north: Signal<number> = this._north.asReadonly();
    private readonly _setup = signal<Readonly<ContrabandSetup> | null>(null);
    /** The variant, the seconds of the customs and the games, picked by the player who started the match: none until it starts */
    public readonly setup: Signal<Readonly<ContrabandSetup> | null> = this._setup.asReadonly();
    private readonly _draw = signal<FairDraw | null>(null);
    // A draw is not reactive: it changes with each of its messages applied
    private readonly drawVersion = signal<number>(0);
    /** The phase of the draw of the seed, none before the match starts */
    public readonly drawPhase: Signal<DrawPhase | null> = computed((): DrawPhase | null => {
        this.drawVersion();
        return this._draw()?.phase ?? null;
    });
    /** The players the draw waits for */
    public readonly drawWaitingFor: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        this.drawVersion();
        return this._draw()?.waitingFor ?? [];
    });
    private readonly _game = signal<ContrabandGameState | null>(null);
    /** The match, once its seed is drawn */
    public readonly game: Signal<ContrabandGameState | null> = this._game.asReadonly();
    public readonly result: Signal<ContrabandResult | null> = computed((): ContrabandResult | null => this._game()?.result() ?? null);

    /**
     * @param index the index of the match in the room
     * @param attempt the draws of the match: one timing out starts the match again
     */
    public constructor(public readonly index: number, public readonly attempt: number) {}

    public get draw(): FairDraw | null {
        return this._draw();
    }

    /** The context of the draw of the seed */
    public get drawContext(): string {
        return `${ this.id() }:draw`;
    }

    /** The match starts: its players, its countries and its setup are final, they draw its seed */
    public open(players: ReadonlyArray<Readonly<SeatedPlayer>>, north: number, setup: Readonly<ContrabandSetup>): void {
        this._players.set(players);
        this._north.set(north);
        this._setup.set(setup);
        this._draw.set(new FairDraw(this.drawContext, this.players()));
    }

    /** A message of the draw applied */
    public drew(): void {
        this.drawVersion.update((version: number) => version + 1);
    }

    public start(game: ContrabandGameState): void {
        this._game.set(game);
    }
}
