import { computed, Signal, signal } from '@angular/core';
import { SeatedPlayer } from '@app/modules/game-table/classes/table-seats';
import { DrawPhase, FairDraw } from './fair-draw';

/** A game played on the chain, its result once over */
export interface CommitRevealGame<Result> {
    readonly result: Signal<Result | null>;
}

/** The result of a game */
export type ResultOf<Game> = Game extends CommitRevealGame<infer Result> ? Result : never;

/**
 * A game of the room, from its start: its players and its setup, the draw of its seed, then the game itself. Its id holds
 * the salt of each player, drawn when it took its seat, the index of the game in the room and its attempt: no commitment
 * of a game in another room of the same name, nor of a former game of the room, is a commitment of this one.
 *
 * A game without a setup, the Bid Poker, opens with null.
 */
export class PlayedCommitRevealGame<Game extends CommitRevealGame<Result>, Setup = null, Result = ResultOf<Game>> {
    private readonly _players = signal<ReadonlyArray<Readonly<SeatedPlayer>>>([]);
    /** The players of the game, in the order of their seats: none until it starts */
    public readonly players: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> =>
        this._players().map((player: Readonly<SeatedPlayer>) => player.name));
    public readonly id: Signal<string> = computed((): string =>
        [...this._players().map((player: Readonly<SeatedPlayer>) => player.salt), this.index, this.attempt].join(':'));
    private readonly _setup = signal<Readonly<Setup> | null>(null);
    /** The setup picked by the player who started the game: none until it starts */
    public readonly setup: Signal<Readonly<Setup> | null> = this._setup.asReadonly();
    private readonly _draw = signal<FairDraw | null>(null);
    // A draw is not reactive: it changes with each of its messages applied
    private readonly drawVersion = signal<number>(0);
    /** The phase of the draw of the seed, none before the game starts */
    public readonly drawPhase: Signal<DrawPhase | null> = computed((): DrawPhase | null => {
        this.drawVersion();
        return this._draw()?.phase ?? null;
    });
    /** The players the draw waits for */
    public readonly drawWaitingFor: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        this.drawVersion();
        return this._draw()?.waitingFor ?? [];
    });
    private readonly _game = signal<Game | null>(null);
    /** The game, once its seed is drawn */
    public readonly game: Signal<Game | null> = this._game.asReadonly();
    public readonly result: Signal<Result | null> = computed((): Result | null => this._game()?.result() ?? null);

    /**
     * @param index the index of the game in the room
     * @param attempt the draws of the game: one timing out starts the game again
     */
    public constructor(public readonly index: number, public readonly attempt: number) {}

    public get draw(): FairDraw | null {
        return this._draw();
    }

    /** The context of the draw of the seed */
    public get drawContext(): string {
        return `${ this.id() }:draw`;
    }

    /** The game starts: its players and its setup are final, they draw its seed */
    public open(players: ReadonlyArray<Readonly<SeatedPlayer>>, setup: Readonly<Setup>): void {
        this._players.set(players);
        this._setup.set(setup);
        this._draw.set(new FairDraw(this.drawContext, this.players()));
    }

    /** A message of the draw applied */
    public drew(): void {
        this.drawVersion.update((version: number) => version + 1);
    }

    public start(game: Game): void {
        this._game.set(game);
    }
}
